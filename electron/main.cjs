/* Electron main process — boots the Astro Node server in-process and shows it
 * in a BrowserWindow. Plain CommonJS to avoid ESM/Electron edge cases.
 */
const { app, BrowserWindow, shell, Menu, dialog } = require("electron");
const { autoUpdater } = require("electron-updater");
const path = require("node:path");
const net = require("node:net");
const { pathToFileURL } = require("node:url");
const { homedir } = require("node:os");
const { createWriteStream } = require("node:fs");

const logFile = path.join(homedir(), ".fractal", "fractal.log");
const logStream = createWriteStream(logFile, { flags: "a" });
const originalLog = console.log;
const originalError = console.error;

console.log = function(...args) {
  const msg = args.map(a => typeof a === "string" ? a : JSON.stringify(a)).join(" ");
  logStream.write(`[${new Date().toISOString()}] ${msg}\n`);
  originalLog.apply(console, args);
};

console.error = function(...args) {
  const msg = args.map(a => typeof a === "string" ? a : JSON.stringify(a)).join(" ");
  logStream.write(`[${new Date().toISOString()}] ERROR: ${msg}\n`);
  originalError.apply(console, args);
};

let mainWindow = null;
let serverPromise = null;
let terminalServerPromise = null;
let updateCheckInFlight = false;
let updateDownloadInFlight = false;
let updateStartupTimer = null;
let updatePollTimer = null;

const AUTO_UPDATE_STARTUP_DELAY_MS = 15_000;
const AUTO_UPDATE_POLL_INTERVAL_MS = 4 * 60 * 60 * 1000;

// Allow only one instance.
if (!app.requestSingleInstanceLock()) {
  app.quit();
  process.exit(0);
}
app.on("second-instance", () => {
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  }
});

// Make sure shells launched from Finder see the user's PATH (so git/tmux/pi resolve).
function ensureUserPath() {
  if (process.platform !== "darwin") return;
  if (process.env.FRACTAL_PATH_PATCHED) return;
  try {
    const { execFileSync } = require("node:child_process");
    // Only honor SHELL if it's an absolute path to an existing binary in a
    // standard system location. Otherwise fall back to /bin/zsh.
    const fs = require("node:fs");
    const ALLOWED_SHELL_DIRS = ["/bin/", "/usr/bin/", "/usr/local/bin/", "/opt/homebrew/bin/"];
    const envShell = process.env.SHELL || "";
    const shellOk = envShell.startsWith("/")
      && ALLOWED_SHELL_DIRS.some((d) => envShell.startsWith(d))
      && fs.existsSync(envShell);
    const shellBin = shellOk ? envShell : "/bin/zsh";
    const out = execFileSync(shellBin, ["-l", "-c", "echo $PATH"], {
      encoding: "utf8",
      timeout: 2000,
    }).trim();
    if (out) {
      process.env.PATH = out;
      process.env.FRACTAL_PATH_PATCHED = "1";
    }
  } catch {
    /* best effort */
  }
}

function clearUpdateTimers() {
  if (updateStartupTimer) {
    clearTimeout(updateStartupTimer);
    updateStartupTimer = null;
  }
  if (updatePollTimer) {
    clearInterval(updatePollTimer);
    updatePollTimer = null;
  }
}

function canUseAutoUpdates() {
  return process.platform === "darwin" && app.isPackaged;
}

async function checkForUpdates(trigger = "manual") {
  if (!canUseAutoUpdates() || updateCheckInFlight || updateDownloadInFlight) return;
  updateCheckInFlight = true;
  try {
    console.info(`[fractal-updater] checking for updates (${trigger})`);
    await autoUpdater.checkForUpdates();
  } catch (error) {
    console.error("[fractal-updater] update check failed", error);
    if (trigger === "manual") {
      await dialog.showMessageBox({
        type: "warning",
        title: "Update check failed",
        message: "Fractal could not check for updates.",
        detail: error instanceof Error ? error.message : String(error),
        buttons: ["OK"],
      });
    }
  } finally {
    updateCheckInFlight = false;
  }
}

function configureAutoUpdater() {
  if (!canUseAutoUpdates()) {
    console.info("[fractal-updater] disabled (development build or unsupported platform)");
    return;
  }

  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = false;

  autoUpdater.on("checking-for-update", () => {
    console.info("[fractal-updater] checking for update");
  });

  autoUpdater.on("update-available", async (info) => {
    if (updateDownloadInFlight) return;
    const { response } = await dialog.showMessageBox({
      type: "info",
      title: "Update available",
      message: `Fractal ${info.version} is available.`,
      detail: "Do you want to download it now?",
      buttons: ["Download", "Later"],
      defaultId: 0,
      cancelId: 1,
    });

    if (response !== 0) return;

    updateDownloadInFlight = true;
    try {
      await autoUpdater.downloadUpdate();
    } catch (error) {
      console.error("[fractal-updater] update download failed", error);
      await dialog.showMessageBox({
        type: "warning",
        title: "Download failed",
        message: "Fractal could not download the update.",
        detail: error instanceof Error ? error.message : String(error),
        buttons: ["OK"],
      });
    } finally {
      updateDownloadInFlight = false;
    }
  });

  autoUpdater.on("update-not-available", () => {
    console.info("[fractal-updater] no updates available");
  });

  autoUpdater.on("download-progress", (progress) => {
    console.info(`[fractal-updater] download progress ${Math.floor(progress.percent)}%`);
  });

  autoUpdater.on("update-downloaded", async (info) => {
    const { response } = await dialog.showMessageBox({
      type: "info",
      title: "Update ready",
      message: `Fractal ${info.version} has been downloaded.`,
      detail: "Restart Fractal now to install the update?",
      buttons: ["Restart and Install", "Later"],
      defaultId: 0,
      cancelId: 1,
    });

    if (response === 0) {
      autoUpdater.quitAndInstall();
    }
  });

  autoUpdater.on("error", (error) => {
    console.error("[fractal-updater] updater error", error);
  });

  updateStartupTimer = setTimeout(() => {
    updateStartupTimer = null;
    void checkForUpdates("startup");
  }, AUTO_UPDATE_STARTUP_DELAY_MS);
  updateStartupTimer.unref?.();

  updatePollTimer = setInterval(() => {
    void checkForUpdates("poll");
  }, AUTO_UPDATE_POLL_INTERVAL_MS);
  updatePollTimer.unref?.();
}

async function findFreePort() {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.unref();
    srv.on("error", reject);
    srv.listen(0, "127.0.0.1", () => {
      const port = srv.address().port;
      srv.close(() => resolve(port));
    });
  });
}

async function startTerminalServer() {
  if (terminalServerPromise) return terminalServerPromise;
  ensureUserPath();
  terminalServerPromise = (async () => {
    const port = await findFreePort();
    const { createTerminalServer } = require("./terminal-server.cjs");
    const server = createTerminalServer();
    await new Promise((resolve, reject) => {
      server.once("error", reject);
      server.listen(port, "127.0.0.1", () => {
        server.off("error", reject);
        resolve();
      });
    });
    console.log(`[fractal-terminal] server listening on 127.0.0.1:${port}`);
    return port;
  })();
  return terminalServerPromise;
}

async function startAstroServer() {
  if (serverPromise) return serverPromise;
  ensureUserPath();
  serverPromise = (async () => {
    const port = await findFreePort();
    const fractalHome = path.join(homedir(), ".fractal");
    process.env.HOST = "127.0.0.1";
    process.env.PORT = String(port);
    process.env.FRACTAL_HOME = fractalHome;
    process.env.FRACTAL_DB_PATH = path.join(fractalHome, "fractal.db");
    process.env.FRACTAL_BOOT = "1";
    console.log(`[fractal-boot] setting FRACTAL_HOME=${fractalHome}`);
    console.log(`[fractal-boot] setting FRACTAL_DB_PATH=${path.join(fractalHome, "fractal.db")}`);

    // Astro Node standalone entry. When the app is asar'd, dist/ is inside
    // the asar (read-only) — that's fine, the server only reads from there.
    const entry = path.join(__dirname, "..", "dist", "server", "entry.mjs");
    console.log(`[fractal-boot] importing server entry: ${entry}`);
    await import(pathToFileURL(entry).href);
    console.log(`[fractal-boot] server started successfully`);
    return port;
  })();
  return serverPromise;
}

async function createWindow() {
  const rendererUrl = process.env.ELECTRON_RENDERER_URL;
  const terminalPort = await startTerminalServer();
  const port = rendererUrl ? null : await startAstroServer();
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 880,
    minHeight: 560,
    backgroundColor: "#0b0b0d",
    titleBarStyle: process.platform === "darwin" ? "hiddenInset" : "default",
    show: false,
    webPreferences: {
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      preload: path.join(__dirname, "preload.cjs"),
      additionalArguments: [`--fractal-terminal-port=${terminalPort}`],
    },
  });
  mainWindow.once("ready-to-show", () => mainWindow.show());
  mainWindow.on("closed", () => {
    if (mainWindow && mainWindow.isDestroyed()) {
      mainWindow = null;
    }
  });
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: "deny" };
  });
  mainWindow.webContents.on("will-navigate", (event, url) => {
    const allowedPrefix = rendererUrl || `http://127.0.0.1:${port}`;
    if (url !== allowedPrefix && !url.startsWith(`${allowedPrefix}/`)) {
      event.preventDefault();
      void shell.openExternal(url);
    }
  });
  await mainWindow.loadURL(rendererUrl || `http://127.0.0.1:${port}`);
}

function buildMenu() {
  const isMac = process.platform === "darwin";
  const fractalMenu = {
    label: app.name,
    submenu: [
      { role: "about" },
      { type: "separator" },
      {
        label: "Check for Updates…",
        click: () => void checkForUpdates("menu"),
      },
      { type: "separator" },
      { role: "services" },
      { type: "separator" },
      { role: "hide" },
      { role: "hideOthers" },
      { role: "unhide" },
      { type: "separator" },
      { role: "quit" },
    ],
  };

  const template = [
    ...(isMac ? [fractalMenu] : []),
    { role: "editMenu" },
    {
      role: "viewMenu",
      submenu: [
        { role: "reload" },
        { role: "forceReload" },
        { type: "separator" },
        { role: "resetZoom" },
        { role: "zoomIn" },
        { role: "zoomOut" },
        { type: "separator" },
        { role: "togglefullscreen" },
        ...(app.isPackaged ? [] : [{ role: "toggleDevTools" }]),
      ],
    },
    { role: "windowMenu" },
    {
      role: "help",
      submenu: [
        {
          label: "Check for Updates…",
          click: () => void checkForUpdates("menu"),
        },
      ],
    },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

app.whenReady().then(() => {
  buildMenu();
  configureAutoUpdater();
  void createWindow();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) void createWindow();
  });
});

app.on("before-quit", () => {
  clearUpdateTimers();
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

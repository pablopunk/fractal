/* Electron main process — boots the Astro Node server in-process and shows it
 * in a BrowserWindow. Plain CommonJS to avoid ESM/Electron edge cases.
 */
const { app, BrowserWindow, shell, Menu, dialog, ipcMain } = require("electron");
const { autoUpdater } = require("electron-updater");
const http = require("node:http");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const { homedir } = require("node:os");
const { createWriteStream, mkdirSync } = require("node:fs");

const fractalLogDir = path.join(homedir(), ".fractal");
mkdirSync(fractalLogDir, { recursive: true });
const logFile = path.join(fractalLogDir, "fractal.log");
const logStream = createWriteStream(logFile, { flags: "a" });
const originalLog = console.log;
const originalError = console.error;

console.log = (...args) => {
  const msg = args.map((a) => (typeof a === "string" ? a : JSON.stringify(a))).join(" ");
  logStream.write(`[${new Date().toISOString()}] ${msg}\n`);
  originalLog.apply(console, args);
};

console.error = (...args) => {
  const msg = args.map((a) => (typeof a === "string" ? a : JSON.stringify(a))).join(" ");
  logStream.write(`[${new Date().toISOString()}] ERROR: ${msg}\n`);
  originalError.apply(console, args);
};

let mainWindow = null;
let mainServer = null;
let serverCleanup = null;
let serverStartPromise = null;
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

// Make sure desktop-launched app processes see the user's login shell env.
function ensureUserPath() {
  if (process.platform !== "darwin" && process.platform !== "linux") return;
  if (process.env.FRACTAL_PATH_PATCHED) return;
  try {
    const { execFileSync } = require("node:child_process");
    const fs = require("node:fs");
    const ALLOWED_SHELL_DIRS = ["/bin/", "/usr/bin/", "/usr/local/bin/", "/opt/homebrew/bin/"];
    const fallbackShells =
      process.platform === "darwin" ? ["/bin/zsh", "/bin/bash"] : ["/bin/bash", "/bin/zsh"];
    const envShell = process.env.SHELL || "";
    const shellOk =
      envShell.startsWith("/") &&
      ALLOWED_SHELL_DIRS.some((d) => envShell.startsWith(d)) &&
      fs.existsSync(envShell);
    const shellBin = shellOk ? envShell : fallbackShells.find((shell) => fs.existsSync(shell));
    if (!shellBin) return;
    const out = execFileSync(shellBin, ["-l", "-c", "/usr/bin/env -0"], {
      encoding: "utf8",
      timeout: 2000,
      maxBuffer: 1024 * 1024,
    });
    for (const entry of out.split("\0")) {
      const eq = entry.indexOf("=");
      if (eq <= 0) continue;
      const key = entry.slice(0, eq);
      if (["_", "PWD", "OLDPWD", "SHLVL"].includes(key)) continue;
      process.env[key] = entry.slice(eq + 1);
    }
    process.env.FRACTAL_PATH_PATCHED = "1";
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
  if (!app.isPackaged) return false;
  if (process.platform === "darwin") return true;
  if (process.platform === "linux") return Boolean(process.env.APPIMAGE);
  return false;
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

async function startUnifiedServer() {
  if (serverStartPromise) return serverStartPromise;
  serverStartPromise = (async () => {
    ensureUserPath();
    const fractalHome = path.join(homedir(), ".fractal");
    process.env.FRACTAL_HOME = fractalHome;
    process.env.FRACTAL_DB_PATH = path.join(fractalHome, "fractal.db");
    process.env.FRACTAL_BOOT = "1";
    console.log(`[fractal-boot] setting FRACTAL_HOME=${fractalHome}`);
    console.log(`[fractal-boot] setting FRACTAL_DB_PATH=${path.join(fractalHome, "fractal.db")}`);

    const entry = path.join(__dirname, "..", "dist", "server", "entry.mjs");
    console.log(`[fractal-boot] importing server entry: ${entry}`);
    process.env.ASTRO_NODE_AUTOSTART = "disabled";
    const mod = await import(pathToFileURL(entry).href);
    const handler = mod.handler;
    if (typeof handler !== "function") {
      throw new Error("Astro standalone entry did not export a handler function");
    }

    const server = http.createServer(handler);
    const { attachTerminalWSServer } = require("./terminal-server.cjs");
    const { cleanup: closeTerminal, handleUpgrade } = attachTerminalWSServer();

    server.on("upgrade", (req, socket, head) => {
      handleUpgrade(req, socket, head);
    });

    await new Promise((resolve, reject) => {
      server.once("error", reject);
      server.listen(0, "127.0.0.1", () => {
        server.off("error", reject);
        resolve();
      });
    });

    const port = server.address().port;
    mainServer = server;
    serverCleanup = closeTerminal;
    console.log(`[fractal-server] listening on http://127.0.0.1:${port}`);
    return { port, server, cleanup: closeTerminal };
  })();
  return serverStartPromise;
}

async function startDevProxy(astroDevPort) {
  if (serverStartPromise) return serverStartPromise;
  serverStartPromise = (async () => {
    const astroOrigin = `http://127.0.0.1:${astroDevPort}`;

    const server = http.createServer((clientReq, clientRes) => {
      const proxyReq = http.request(
        {
          hostname: "127.0.0.1",
          port: astroDevPort,
          path: clientReq.url,
          method: clientReq.method,
          headers: clientReq.headers,
        },
        (proxyRes) => {
          clientRes.writeHead(proxyRes.statusCode, proxyRes.headers);
          proxyRes.pipe(clientRes);
        },
      );
      proxyReq.on("error", () => {
        if (!clientRes.headersSent) {
          clientRes.writeHead(502);
          clientRes.end("Dev proxy error");
        }
      });
      clientReq.pipe(proxyReq);
    });

    const { attachTerminalWSServer } = require("./terminal-server.cjs");
    const { cleanup: closeTerminal, handleUpgrade } = attachTerminalWSServer();

    server.on("upgrade", (req, socket, head) => {
      const url = new URL(req.url, astroOrigin);
      if (url.pathname === "/api/terminal/ws") {
        handleUpgrade(req, socket, head);
        return;
      }

      const proxyReq = http.request({
        hostname: "127.0.0.1",
        port: astroDevPort,
        path: req.url,
        method: req.method,
        headers: req.headers,
      });
      proxyReq.on("upgrade", (proxyRes, proxySocket, proxyHead) => {
        const headers = [
          `HTTP/${proxyRes.httpVersion} ${proxyRes.statusCode} ${proxyRes.statusMessage}`,
          ...Object.entries(proxyRes.headers).map(([k, v]) => `${k}: ${v}`),
          "",
          "",
        ].join("\r\n");
        socket.write(headers);
        if (proxyHead.length) socket.write(proxyHead);
        proxySocket.pipe(socket);
        socket.pipe(proxySocket);
      });
      proxyReq.on("error", () => socket.destroy());
      proxyReq.end(head);
    });

    const port = await new Promise((resolve, reject) => {
      server.once("error", reject);
      server.listen(0, "127.0.0.1", () => {
        server.off("error", reject);
        resolve(server.address().port);
      });
    });

    mainServer = server;
    serverCleanup = closeTerminal;
    console.log(`[fractal-dev-proxy] listening on http://127.0.0.1:${port} -> ${astroOrigin}`);
    return { port, server, cleanup: closeTerminal };
  })();
  return serverStartPromise;
}

async function createWindow() {
  const rendererUrl = process.env.ELECTRON_RENDERER_URL;
  let port;
  if (rendererUrl) {
    const devUrl = new URL(rendererUrl);
    const devPort = parseInt(devUrl.port, 10) || 7666;
    const result = await startDevProxy(devPort);
    port = result.port;
  } else {
    const result = await startUnifiedServer();
    port = result.port;
  }
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 880,
    minHeight: 560,
    backgroundColor: "#00000000",
    transparent: true,
    vibrancy: process.platform === "darwin" ? "under-window" : undefined,
    visualEffectState: process.platform === "darwin" ? "active" : undefined,
    titleBarStyle: process.platform === "darwin" ? "hiddenInset" : "default",
    show: false,
    webPreferences: {
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      preload: path.join(__dirname, "preload.cjs"),
    },
  });
  mainWindow.once("ready-to-show", () => mainWindow.show());
  mainWindow.on("closed", () => {
    if (mainWindow?.isDestroyed()) {
      mainWindow = null;
    }
  });
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: "deny" };
  });
  mainWindow.webContents.on("will-navigate", (event, url) => {
    const allowedPrefix = `http://127.0.0.1:${port}`;
    if (url !== allowedPrefix && !url.startsWith(`${allowedPrefix}/`)) {
      event.preventDefault();
      void shell.openExternal(url);
    }
  });
  await mainWindow.loadURL(`http://127.0.0.1:${port}`);
}

function closeMainServer() {
  const server = mainServer;
  mainServer = null;
  const cleanup = serverCleanup;
  serverCleanup = null;
  if (cleanup) {
    try {
      cleanup();
    } catch (error) {
      console.error("[fractal-server] failed to close terminal connections", error);
    }
  }
  if (server) {
    try {
      server.close();
    } catch (error) {
      console.error("[fractal-server] failed to close server", error);
    }
  }
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
        { role: "toggleDevTools" },
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

ipcMain.handle("open-external", (_event, url) => {
  if (typeof url !== "string" || !/^https?:\/\//i.test(url)) return false;
  void shell.openExternal(url);
  return true;
});

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
  closeMainServer();
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

/* Electron main process — boots the Astro Node server in-process and shows it
 * in a BrowserWindow. Plain CommonJS to avoid ESM/Electron edge cases.
 */
const { app, BrowserWindow, shell, Menu } = require("electron");
const path = require("node:path");
const net = require("node:net");
const { pathToFileURL } = require("node:url");

let mainWindow = null;
let serverPromise = null;

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
    const out = execFileSync(process.env.SHELL || "/bin/zsh", ["-l", "-c", "echo $PATH"], {
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

async function startAstroServer() {
  if (serverPromise) return serverPromise;
  ensureUserPath();
  serverPromise = (async () => {
    const port = await findFreePort();
    const userData = app.getPath("userData");
    process.env.HOST = "127.0.0.1";
    process.env.PORT = String(port);
    process.env.FRACTAL_HOME = userData;
    process.env.FRACTAL_DB_PATH = path.join(userData, "fractal.db");

    // Astro Node standalone entry. When the app is asar'd, dist/ is inside
    // the asar (read-only) — that's fine, the server only reads from there.
    const entry = path.join(__dirname, "..", "dist", "server", "entry.mjs");
    await import(pathToFileURL(entry).href);
    return port;
  })();
  return serverPromise;
}

async function createWindow() {
  const rendererUrl = process.env.ELECTRON_RENDERER_URL;
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
    },
  });
  mainWindow.once("ready-to-show", () => mainWindow.show());
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: "deny" };
  });
  await mainWindow.loadURL(rendererUrl || `http://127.0.0.1:${port}`);
}


function buildMenu() {
  const isMac = process.platform === "darwin";
  const template = [
    ...(isMac
      ? [{ role: "appMenu" }]
      : []),
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
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

app.whenReady().then(() => {
  buildMenu();
  void createWindow();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) void createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

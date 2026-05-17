const { contextBridge, ipcRenderer, webUtils } = require("electron");

const terminalArg = process.argv.find((arg) => arg.startsWith("--fractal-terminal-port="));
const terminalPort = terminalArg ? Number(terminalArg.split("=")[1]) : null;

contextBridge.exposeInMainWorld("electron", {
  platform: process.platform,
  terminalPort: Number.isFinite(terminalPort) ? terminalPort : null,
  getPathForFile(file) {
    try {
      return webUtils.getPathForFile(file);
    } catch {
      return "";
    }
  },
  openExternal(url) {
    return ipcRenderer.invoke("open-external", url);
  },
});

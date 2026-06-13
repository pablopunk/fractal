const { contextBridge, ipcRenderer, webUtils } = require("electron");

contextBridge.exposeInMainWorld("electron", {
  platform: process.platform,
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
  setKeepAwake(enabled) {
    return ipcRenderer.invoke("set-keep-awake", enabled);
  },
  getConfig() {
    return ipcRenderer.invoke("get-config");
  },
  setMode(mode, remoteUrl) {
    return ipcRenderer.invoke("set-mode", mode, remoteUrl);
  },
});

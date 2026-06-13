const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("electronAPI", {
  selectMode(payload) {
    ipcRenderer.send("select-mode", payload);
  },
});

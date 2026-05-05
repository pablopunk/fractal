const { contextBridge, webUtils } = require("electron");

contextBridge.exposeInMainWorld("electron", {
  platform: process.platform,
  getPathForFile(file) {
    try {
      return webUtils.getPathForFile(file);
    } catch {
      return "";
    }
  },
});

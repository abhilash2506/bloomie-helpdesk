const { contextBridge } = require('electron');

contextBridge.exposeInMainWorld('BloomieDesktop', {
  platform: process.platform
});

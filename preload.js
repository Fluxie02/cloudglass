'use strict';

// Bridge between the glass shell (src/index.html) and the main process.
// Only these named functions are exposed; the shell never gets raw IPC access.
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('cloudglass', {
  init: () => ipcRenderer.invoke('init'),
  windowAction: (action) => ipcRenderer.send('window', action),
  setSetting: (key, value) => ipcRenderer.invoke('set-setting', key, value),
  eraseData: () => ipcRenderer.invoke('erase-data'),
  nowPlaying: (np) => ipcRenderer.send('now-playing', np),
  stageWidth: (w) => ipcRenderer.send('stage-width', w),
  onWindowState: (fn) => ipcRenderer.on('window-state', (_e, s) => fn(s)),
  onSettings: (fn) => ipcRenderer.on('settings', (_e, s) => fn(s)),
  onPrivacyStats: (fn) => ipcRenderer.on('privacy-stats', (_e, s) => fn(s)),
});

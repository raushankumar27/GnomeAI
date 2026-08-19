const { contextBridge, ipcRenderer } = require('electron');

// Expose safe APIs to the renderer window
contextBridge.exposeInMainWorld('electronAPI', {
  platform: process.platform,
  // We can add IPC methods if needed, for instance window controls or system notifications
  sendNotification: (title, body) => {
    new Notification(title, { body });
  },
  getBackendPort: () => ipcRenderer.invoke('get-backend-port'),
  onPortUpdated: (callback) => ipcRenderer.on('backend-port-updated', (event, port) => callback(port)),
  updateTrayModels: (data) => ipcRenderer.send('update-tray-models', data),
  onTrayLoadModel: (callback) => ipcRenderer.on('tray-load-model', (event, model) => callback(model)),
  onTrayUnloadModel: (callback) => ipcRenderer.on('tray-unload-model', (event, model) => callback(model)),
  hideOverlay: () => ipcRenderer.send('hide-overlay'),
  resizeOverlay: (width, height) => ipcRenderer.send('resize-overlay', { width, height }),
  showStudio: () => ipcRenderer.send('show-studio'),
  expandSession: (sessionId) => ipcRenderer.send('expand-session', sessionId),
  onOpenSession: (callback) => ipcRenderer.on('open-session', (event, sessionId) => callback(sessionId)),
  onTriggerVoice: (callback) => ipcRenderer.on('trigger-voice', callback),
  openDirectoryDialog: () => ipcRenderer.invoke('open-directory-dialog'),
  openFileDialog: () => ipcRenderer.invoke('open-file-dialog')
});

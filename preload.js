const { contextBridge, ipcRenderer } = require('electron');

// Client config
contextBridge.exposeInMainWorld('clientConfig', {
  setLauncher: (launcher) => ipcRenderer.send('setLauncher', launcher),
});

// Used for logging
contextBridge.exposeInMainWorld('logging', {
  writeToLog: (data) => ipcRenderer.invoke('writeToLog', data),
});

// OoT Interaction
contextBridge.exposeInMainWorld('oot', {
  // Functions callable by renderer to cause IPCMain to perform an action
  receiveItem: (requestId, itemOffset) => ipcRenderer.send('receiveItem', requestId, itemOffset),
  isItemReceivable: (requestId) => ipcRenderer.send('isItemReceivable', requestId),
  getReceivedItemCount: (requestId) => ipcRenderer.send('getReceivedItemCount', requestId),
  getRomName: (requestId) => ipcRenderer.send('getRomName', requestId),
  setNames: (requestId, namesObj) => ipcRenderer.send('setNames', requestId, namesObj),
  getLocationChecks: (requestId) => ipcRenderer.send('getLocationChecks', requestId),
  getCurrentGameMode: (requestId) => ipcRenderer.send('getCurrentGameMode', requestId),
  isGameComplete: (requestId) => ipcRenderer.send('isGameComplete', requestId),
  isDeathLinkEnabled: (requestId) => ipcRenderer.send('isDeathLinkEnabled', requestId),
  isLinkAlive: (requestId) => ipcRenderer.send('isLinkAlive', requestId),
  killLink: (requestId) => ipcRenderer.send('killLink', requestId),
  disconnectAllClients: () => ipcRenderer.send('disconnectAllClients'),

  // Function listenable by renderer to allow IPCMain to report a completed request
  requestComplete: (callback) => ipcRenderer.on('requestComplete', (event, ...args) => callback(...args)),

  // Function listenable by renderer to allow IPCMain to report a connected or disconnected client
  deviceConnected: (callback) => ipcRenderer.on('deviceConnected', (event, connected) => callback(connected)),
});

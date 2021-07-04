const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('ipc', {
  send: (channel, data) => {
    const validChannels = [ 'requestSharedData', 'setLauncher' ];
    if (validChannels.includes(channel)) {
      ipcRenderer.send(channel, data);
    }
  },
  receive: (channel, callback) => {
    const validChannels = ['sharedData'];
    if (validChannels.includes(channel)) {
      ipcRenderer.on(channel, (event, ...args) => callback(...args));
    }
  },
});

// Used for logging
contextBridge.exposeInMainWorld('logging', {
  writeToLog: (data) => ipcRenderer.invoke('writeToLog', data),
});
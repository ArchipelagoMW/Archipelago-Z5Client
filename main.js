const { app, BrowserWindow, dialog, ipcMain } = require('electron');
const fs = require('fs');
const path = require('path');
const md5 = require('md5');
const childProcess = require('child_process');
const net = require('net');

// File handler used for the log file, may be opened in a couple locations
let logFile = null;

const createLogFile = () => {
  // Create log file and open it for writing
  if (!fs.existsSync(path.join(process.env.APPDATA, 'z5client-logs'))) {
    fs.mkdirSync(path.join(process.env.APPDATA, 'z5client-logs'));
  }

  if (logFile) { return logFile; }
  return fs.openSync(path.join(process.env.APPDATA, 'z5client-logs', `${new Date().getTime()}.txt`), 'w');
};

process.on('uncaughtException', (error) => {
  const logFile = createLogFile();
  fs.writeFileSync(logFile, `[${new Date().toLocaleString()}] ${JSON.stringify(error)}`);

  // If there is another client bound to the address, close this client
  if (error.code === 'EADDRINUSE') {
    process.kill(process.pid);
  }
});

// Create the log file for this run
logFile = createLogFile();

// Array to hold socket clients
const socketClients = {};

// Main UI window the user will interact with, used for IPC
let uiWindow = null;

// Perform certain actions during the install process
if (require('electron-squirrel-startup')) {
  if (process.platform === 'win32') {
    // Prepare to add registry entries for .apz5 files
    const Registry = require('winreg');
    const exePath = path.join(process.env.LOCALAPPDATA, 'Z5Client', 'Z5Client.exe');

    // Set file type description for .apz5 files
    const descriptionKey = new Registry({
      hive: Registry.HKCU,
      key: '\\Software\\Classes\\archipelago.Z5client.v1',
    });
    descriptionKey.set(Registry.DEFAULT_VALUE, Registry.REG_SZ, 'Archipelago Binary Patch',
      (error) => console.error(error));

    // Set icon for .apz5 files
    const iconKey = new Registry({
      hive: Registry.HKCU,
      key: '\\Software\\Classes\\archipelago.Z5client.v1\\DefaultIcon',
    });
    iconKey.set(Registry.DEFAULT_VALUE, Registry.REG_SZ, `${exePath},0`, (error) => console.error(error));

    // Set set default program for launching .apz5 files (Z5Client)
    const commandKey = new Registry({
      hive: Registry.HKCU,
      key: '\\Software\\Classes\\archipelago.Z5client.v1\\shell\\open\\command'
    });
    commandKey.set(Registry.DEFAULT_VALUE, Registry.REG_SZ, `"${exePath}" "%1"`, (error) => console.error(error));

    // Set .apz5 files to launch with Z5Client
    const extensionKey = new Registry({
      hive: Registry.HKCU,
      key: '\\Software\\Classes\\.apz5',
    });
    extensionKey.set(Registry.DEFAULT_VALUE, Registry.REG_SZ, 'archipelago.Z5client.v1',
      (error) => console.error(error));
  }

  // Do not launch the client during the install process
  return app.quit();
}

const createWindow = () => {
  const win = new BrowserWindow({
    width: 1280,
    minWidth: 400,
    height: 720,
    minHeight: 100,
    autoHideMenuBar: true,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      enableRemoteModule: false,
      preload: path.join(__dirname, 'preload.js'),
    },
  });

  win.loadFile('index.html');
  return win;
};

const createPatchingWindow = () => {
  const win = new BrowserWindow({
    width: 400,
    height: 75,
    autoHideMenuBar: true,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      enableRemoteModule: false,
    },
  });

  win.loadFile('patching.html');
  return win;
};

app.whenReady().then(async () => {
  // Create the local config file if it does not exist
  const configPath = path.join(process.env.APPDATA, 'z5client.config.json');
  if (!fs.existsSync(configPath)) {
    fs.writeFileSync(configPath,JSON.stringify({}));
  }

  // Load the config into memory
  const configData = fs.readFileSync(configPath).toString();

  // If the config file is empty, it must be regenerated later
  const config = configData ? JSON.parse(configData) : {};
  const validRomHashes = [
    '5BD1FE107BF8106B2AB6650ABECD54D6'.toLowerCase(), // Compressed little-endian
    '6697768A7A7DF2DD27A692A2638EA90B'.toLowerCase(), // Compressed big-endian
    '05f0f3ebacbc8df9243b6148ffe4792f'.toLowerCase(), // Decompressed
  ];

  // Prompt for base rom file if not present in config, missing from disk, or it fails the hash check
  if (
    !config.hasOwnProperty('baseRomPath') || // Base ROM not present in config file
    !fs.existsSync(config.baseRomPath) || // Base ROM not present on file system
    !validRomHashes.includes(md5(fs.readFileSync(config.baseRomPath))) // Base ROM fails hash check
  ) {
    let baseRomPath = dialog.showOpenDialogSync(null, {
      title: 'Select base ROM',
      buttonLabel: 'Choose ROM',
      message: 'Choose a base ROM to be used when patching.',
    });
    // Save base rom filepath back to config file
    if (baseRomPath) {
      config.baseRomPath = baseRomPath[0];
      fs.writeFileSync(configPath, JSON.stringify(Object.assign({}, config, {
        baseRomPath: config.baseRomPath,
      })));
    }
  }

  let patchingWindow = null;

  // Create a new ROM from the patch file if the patch file is provided and the base rom is known
  for (const arg of process.argv) {
    if (arg.substr(-5).toLowerCase() === '.apz5') {
      if (config.hasOwnProperty('baseRomPath') && fs.existsSync(config.baseRomPath)) {
        if (!fs.existsSync(arg)) { break; }
        if (!validRomHashes.includes(md5(fs.readFileSync(config.baseRomPath)))) {
          dialog.showMessageBoxSync({
            type: 'info',
            title: 'Invalid Base ROM',
            message: 'The ROM file for your game could not be created because the base ROM is invalid.',
          });
          break;
        }

        // Patch the .apz5
        patchingWindow = createPatchingWindow();
        await new Promise((r) => setTimeout(r, 250)); // Wait 250 milliseconds for the patching window to render
        const outPath = path.join(path.dirname(arg),
          `${path.basename(arg).substr(0, path.basename(arg).length - 5)}.n64`);
        childProcess.execFileSync(path.join(__dirname, 'oot-patcher', 'Patch.exe'), // Path
          [config.baseRomPath, arg, outPath],
          { timeout: 60000 }); // Timeout the process after one minute

        // If a custom launcher is specified, attempt to launch the ROM file using the specified loader
        if (config.hasOwnProperty('launcherPath') && fs.existsSync(config.launcherPath)) {
          childProcess.spawn(config.launcherPath, [outPath], { detached: true });
          break;
        }
        // If no custom launcher is specified, launch the rom with explorer on Windows
        if (process.platform === 'win32') {
          childProcess.spawn('explorer', [outPath], { detached: true });
        }
      }
      break;
    }
  }

  uiWindow = createWindow();
  if (patchingWindow) { patchingWindow.close(); }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      uiWindow = createWindow();
      if (patchingWindow) { patchingWindow.close(); }
    }
  });

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
      app.quit();
    }
  });
}).catch((error) => {
  fs.writeFileSync(logFile, `[${new Date().toLocaleString()}] ${JSON.stringify(error)}`);
});

// IPC listener for client config
ipcMain.on('setLauncher', (event, args) => {
  // Allow the user to specify a program to launch the ROM
  const configPath = path.join(process.env.APPDATA, 'z5client.config.json');
  const config = JSON.parse(fs.readFileSync(configPath).toString());
  const launcherPath = dialog.showOpenDialogSync({
    title: 'Locate ROM Launcher',
    buttonLabel: 'Select Launcher',
    message: 'Choose an executable to be used when launching the ROM',
  });
  if (launcherPath) {
    fs.writeFileSync(configPath, JSON.stringify(Object.assign({}, config, {
      launcherPath: launcherPath[0],
    })));
  }
});

// IPC listener for logging
ipcMain.handle('writeToLog', (event, data) => fs.writeFileSync(logFile, `[${new Date().toLocaleString()}] ${data}`));

// Host a socket server used for communicating with the N64
const hostname = '127.0.0.1';
const port = 28920;
const socketMessage = (msg) => `${msg}\r\n`;
net.createServer((socket) => {
  const socketId = Math.random() * 1000000000;

  socket.on('data', (data) => {
    const messageParts = data.toString().split('|');
    const messageType = messageParts.splice(0,1)[0];
    switch (messageType) {
      case 'requestComplete':
        uiWindow.webContents.send('requestComplete', messageParts);
        break;

      default:
        console.warn(`Unknown message type received: ${messageType} with data:\n${JSON.stringify(messageParts)}`);
        break;
    }
  });

  // On close, remove socket from list of active clients
  socket.on('close', (data) =>{
    delete socketClients[socketId];
    if (Object.keys(socketClients).length === 0) {
      uiWindow.webContents.send('deviceConnected', false);
    }
  });

  // On error, remove socket from list of active clients
  socket.on('error', (err) => {
    delete socketClients[socketId];
    if (Object.keys(socketClients).length === 0) {
      uiWindow.webContents.send('deviceConnected', false);
    }
    console.log(err)
  });

  // Store the client in the list of active clients
  socketClients[socketId] = socket;

  uiWindow.webContents.send('deviceConnected', true);
}).listen(port, hostname);

// Interprocess communication with the renderer process, used for communication with OoT LUA Script
ipcMain.on('receiveItem', (event, requestId, itemOffset) => {
  Object.values(socketClients).forEach((socket) => {
    socket.write(socketMessage(`receiveItem|${requestId}|${itemOffset}`));
  });
});
ipcMain.on('isItemReceivable', (event, requestId) => {
  Object.values(socketClients).forEach((socket) => {
    socket.write(socketMessage(`isItemReceivable|${requestId}`));
  });
});
ipcMain.on('getReceivedItemCount', (event, requestId) => {
  Object.values(socketClients).forEach((socket) => {
    socket.write(socketMessage(`getReceivedItemCount|${requestId}`));
  });
});
ipcMain.on('getRomName', (event, requestId) => {
  Object.values(socketClients).forEach((socket) => {
    socket.write(socketMessage(`getRomName|${requestId}`));
  });
});
ipcMain.on('setNames', (event, requestId, namesObj) => {
  Object.values(socketClients).forEach((socket) => {
    let commandStr = `setNames|${requestId}`;
    Object.keys(namesObj).forEach((key) => commandStr += `|${key}|${namesObj[key]}`);
    socket.write(socketMessage(commandStr));
  });
});
ipcMain.on('getLocationChecks', (event, requestId) => {
  Object.values(socketClients).forEach((socket) => {
    socket.write(socketMessage(`getLocationChecks|${requestId}`));
  });
});
ipcMain.on('getCurrentGameMode', (event, requestId) => {
  Object.values(socketClients).forEach((socket) => {
    socket.write(socketMessage(`getCurrentGameMode|${requestId}`));
  });
});
ipcMain.on('isGameComplete', (event, requestId) => {
  Object.values(socketClients).forEach((socket) => {
    socket.write(socketMessage(`isGameComplete|${requestId}`));
  });
});
ipcMain.on('isDeathLinkEnabled', (event, requestId) => {
  Object.values(socketClients).forEach((socket) => {
    socket.write(socketMessage(`isDeathLinkEnabled|${requestId}`));
  });
});
ipcMain.on('isLinkAlive', (event, requestId) => {
  Object.values(socketClients).forEach((socket) => {
    socket.write(socketMessage(`isLinkAlive|${requestId}`));
  });
});
ipcMain.on('killLink', (event, requestId) => {
  Object.values(socketClients).forEach((socket) => {
    socket.write(socketMessage(`killLink|${requestId}`));
  });
});
ipcMain.on('disconnectAllClients', (event) => {
  Object.values(socketClients).forEach((socket) => {
    socket.destroy();
  });
});

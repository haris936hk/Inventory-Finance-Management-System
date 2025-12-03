// ========== electron/main.js ==========
const { app, BrowserWindow, Menu, ipcMain, dialog } = require('electron');
const path = require('path');
const backendManager = require('./backend-manager');

const isDev = process.env.ELECTRON_IS_DEV === '1';

// Disable GPU acceleration on Windows to prevent crashes
if (process.platform === 'win32') {
  app.commandLine.appendSwitch('disable-gpu');
  app.commandLine.appendSwitch('disable-gpu-sandbox');
}

let mainWindow;
let backendStarted = false;

async function startBackend() {
  console.log('🚀 Initializing backend server...');
  const result = await backendManager.start();

  if (result.success) {
    backendStarted = true;
    if (result.alreadyRunning) {
      console.log('ℹ️ Backend was already running');
    }
    return true;
  } else {
    dialog.showErrorBox(
      'Backend Server Error',
      `Failed to start backend server:\n\n${result.error}\n\nThe application cannot function without the backend. Please restart the application.`
    );
    return false;
  }
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1024,
    minHeight: 768,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js')
    },
    // icon: path.join(__dirname, '../build/icon.png'),
    show: false,
    backgroundColor: '#ffffff' // Prevent flash of unstyled content
  });

  // Load the app
  if (isDev) {
    // Development mode - load from React dev server
    const startUrl = 'http://localhost:3000';

    console.log('🚀 Loading development server from:', startUrl);

    mainWindow.loadURL(startUrl).catch(err => {
      console.error('❌ Failed to load dev server:', err);
      dialog.showErrorBox(
        'Development Server Not Running',
        'Please make sure the React development server is running on http://localhost:3000\n\n' +
        'Run "npm start" in the frontend directory first, then run "npm run electron-dev".\n\n' +
        'Or use the automated script that starts both together.'
      );
    });

    mainWindow.webContents.openDevTools();
  } else {
    // Production mode - load from built files
    const indexPath = path.join(__dirname, '../build/index.html');
    console.log('📦 Loading production build from:', indexPath);
    mainWindow.loadFile(indexPath);
  }

  // Show window when ready
  mainWindow.once('ready-to-show', () => {
    console.log('✅ Window ready to show');
    mainWindow.show();
  });

  // Debug logging for navigation events
  mainWindow.webContents.on('did-fail-load', (event, errorCode, errorDescription) => {
    console.error('❌ Failed to load:', errorCode, errorDescription);
    if (isDev && errorCode === -102) {
      console.error('💡 Tip: Make sure React dev server is running on http://localhost:3000');
    }
  });

  mainWindow.webContents.on('did-finish-load', () => {
    console.log('✅ Content loaded successfully');
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  // Create application menu
  createMenu();
}

function createMenu() {
  const template = [
    {
      label: 'File',
      submenu: [
        {
          label: 'Import Excel',
          accelerator: 'CmdOrCtrl+I',
          click: () => {
            mainWindow.webContents.send('menu-import');
          }
        },
        {
          label: 'Export Data',
          accelerator: 'CmdOrCtrl+E',
          click: () => {
            mainWindow.webContents.send('menu-export');
          }
        },
        { type: 'separator' },
        {
          label: 'Print',
          accelerator: 'CmdOrCtrl+P',
          click: () => {
            mainWindow.webContents.print();
          }
        },
        { type: 'separator' },
        {
          label: 'Quit',
          accelerator: 'CmdOrCtrl+Q',
          click: () => {
            app.quit();
          }
        }
      ]
    },
    {
      label: 'Edit',
      submenu: [
        { label: 'Undo', accelerator: 'CmdOrCtrl+Z', role: 'undo' },
        { label: 'Redo', accelerator: 'Shift+CmdOrCtrl+Z', role: 'redo' },
        { type: 'separator' },
        { label: 'Cut', accelerator: 'CmdOrCtrl+X', role: 'cut' },
        { label: 'Copy', accelerator: 'CmdOrCtrl+C', role: 'copy' },
        { label: 'Paste', accelerator: 'CmdOrCtrl+V', role: 'paste' }
      ]
    },
    {
      label: 'View',
      submenu: [
        { label: 'Reload', accelerator: 'CmdOrCtrl+R', role: 'reload' },
        { label: 'Toggle DevTools', accelerator: 'F12', role: 'toggleDevTools' },
        { type: 'separator' },
        { label: 'Actual Size', accelerator: 'CmdOrCtrl+0', role: 'resetZoom' },
        { label: 'Zoom In', accelerator: 'CmdOrCtrl+Plus', role: 'zoomIn' },
        { label: 'Zoom Out', accelerator: 'CmdOrCtrl+-', role: 'zoomOut' },
        { type: 'separator' },
        { label: 'Toggle Fullscreen', accelerator: 'F11', role: 'togglefullscreen' }
      ]
    },
    {
      label: 'Help',
      submenu: [
        {
          label: 'About',
          click: () => {
            dialog.showMessageBox(mainWindow, {
              type: 'info',
              title: 'About',
              message: 'Inventory & Finance Management System',
              detail: 'Version 1.0.0\n© 2024 Your Company',
              buttons: ['OK']
            });
          }
        }
      ]
    }
  ];

  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);
}

// App event handlers
app.whenReady().then(async () => {
  // Start backend server first
  const backendOk = await startBackend();

  if (backendOk) {
    // Create window after backend is ready
    createWindow();
  } else {
    // Backend failed to start, quit app
    app.quit();
  }
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

// Cleanup: Stop backend when app quits
app.on('will-quit', async (event) => {
  if (backendStarted) {
    event.preventDefault(); // Prevent quit until backend stops

    console.log('🛑 Application quitting, stopping backend...');
    await backendManager.stop();

    // Now actually quit
    app.exit(0);
  }
});

// IPC handlers for file operations
ipcMain.handle('show-save-dialog', async (event, options) => {
  const result = await dialog.showSaveDialog(mainWindow, options);
  return result;
});

ipcMain.handle('show-open-dialog', async (event, options) => {
  const result = await dialog.showOpenDialog(mainWindow, options);
  return result;
});
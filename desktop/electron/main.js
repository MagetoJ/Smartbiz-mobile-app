const { app, BrowserWindow, Tray, Menu } = require('electron');
const path = require('path');
const { spawn } = require('child_process');

let mainWindow;
let pyBackend;
let tray;

function startBackend() {
  const backendPath = app.isPackaged 
    ? path.join(process.resourcesPath, 'backend.exe')
    : path.join(__dirname, '../../backend/main.py');

  if (app.isPackaged) {
    pyBackend = spawn(backendPath, [], {
      env: { ...process.env, DATABASE_MODE: 'local' }
    });
  } else {
    // In dev mode, we assume the user starts the backend manually or we spawn python
    pyBackend = spawn('python', [backendPath], {
      env: { ...process.env, DATABASE_MODE: 'local' }
    });
  }

  pyBackend.stdout.on('data', (data) => console.log(`Backend: ${data}`));
  pyBackend.stderr.on('data', (data) => console.error(`Backend Error: ${data}`));
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
    },
    icon: path.join(__dirname, 'assets/icon.ico')
  });

  const startUrl = app.isPackaged
    ? `file://${path.join(__dirname, '../frontend/dist/index.html')}`
    : 'http://localhost:5173';

  mainWindow.loadURL(startUrl);

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

function createTray() {
  tray = new Tray(path.join(__dirname, 'assets/icon.ico'));
  const contextMenu = Menu.buildFromTemplate([
    { label: 'Show App', click: () => mainWindow.show() },
    { label: 'Quit', click: () => app.quit() }
  ]);
  tray.setToolTip('StatBricks POS');
  tray.setContextMenu(contextMenu);
}

app.on('ready', () => {
  startBackend();
  createWindow();
  // createTray(); // Optional
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    if (pyBackend) pyBackend.kill();
    app.quit();
  }
});

app.on('activate', () => {
  if (mainWindow === null) createWindow();
});

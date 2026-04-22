const { app, BrowserWindow, shell, nativeImage } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');

const APP_URL = process.env.BLOOMIE_APP_URL || 'http://127.0.0.1:4181';
const ICON_PATH = path.join(__dirname, '..', '..', 'app-assets', 'bloomie-icon.svg');
let mainWindow = null;
let localServer = null;
const hasSingleInstanceLock = app.requestSingleInstanceLock();

function getMascotIcon() {
  try {
    const svg = fs.readFileSync(ICON_PATH, 'utf8');
    const dataUrl = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
    return nativeImage.createFromDataURL(dataUrl);
  } catch (err) {
    return nativeImage.createEmpty();
  }
}

function startLocalServer() {
  if (process.env.BLOOMIE_APP_URL) return;
  if (process.argv.some(arg => arg && arg.endsWith(path.join('backend', 'server.js')))) return;
  const userDataDir = app.getPath('userData');
  const serverEntry = app.isPackaged
    ? path.join(process.resourcesPath, 'app.asar.unpacked', 'backend', 'server.js')
    : path.join(__dirname, '..', '..', 'backend', 'server.js');
  const appRoot = app.isPackaged
    ? path.join(process.resourcesPath, 'app.asar')
    : path.join(__dirname, '..', '..');
  localServer = spawn(process.execPath, [serverEntry], {
    env: {
      ...process.env,
      ELECTRON_RUN_AS_NODE: '1',
      BLOOMIE_APP_ROOT: appRoot,
      BLOOMIE_DATA_DIR: path.join(userDataDir, 'backend-data'),
      BLOOMIE_LOG_DIR: path.join(userDataDir, 'backend-logs'),
      BLOOMIE_BACKUP_DIR: path.join(userDataDir, 'backend-backups'),
      BLOOMIE_PORT: process.env.BLOOMIE_PORT || '4181',
      BLOOMIE_HOST: '127.0.0.1'
    },
    stdio: 'ignore'
  });
}

function createWindow() {
  if (mainWindow && !mainWindow.isDestroyed()) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
    return mainWindow;
  }
  const mascotIcon = getMascotIcon();
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 920,
    minWidth: 1100,
    minHeight: 760,
    backgroundColor: '#050508',
    autoHideMenuBar: true,
    title: 'Bloomie',
    icon: mascotIcon.isEmpty() ? undefined : mascotIcon,
    webPreferences: {
      preload: path.join(__dirname, 'electron-preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });
  mainWindow.loadURL(APP_URL);
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });
  mainWindow.on('closed', () => {
    mainWindow = null;
  });
  return mainWindow;
}

if (!hasSingleInstanceLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
      return;
    }
    createWindow();
  });
}

app.whenReady().then(() => {
  const mascotIcon = getMascotIcon();
  if (process.platform === 'darwin' && app.dock && !mascotIcon.isEmpty()) {
    app.dock.setIcon(mascotIcon);
  }
  startLocalServer();
  createWindow();
  app.on('activate', () => {
    createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('before-quit', () => {
  if (localServer) localServer.kill();
});

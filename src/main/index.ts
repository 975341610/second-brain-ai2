import log from 'electron-log';
import { app, BrowserWindow, Tray, Menu, ipcMain, dialog, nativeImage } from 'electron';
import path from 'path';
import fs from 'fs';
import { autoUpdater } from 'electron-updater';
import { SidecarManager } from './sidecar';
import { spawn } from 'child_process';

let mainWindow: BrowserWindow | null = null;
let splashWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
const isDev = !app.isPackaged;

process.on('uncaughtException', (error) => {
  log.error('Uncaught Exception:', error);
});
process.on('unhandledRejection', (reason) => {
  log.error('Unhandled Rejection:', reason);
});

const getBackendPath = () => {
  if (isDev) {
    return path.join(app.getAppPath(), 'backend');
  }
  return path.join(process.resourcesPath, 'backend');
};

const sidecar = new SidecarManager(getBackendPath(), isDev);

function logStartupContext() {
  const backendPath = getBackendPath();
  const rendererIndexPath = path.join(__dirname, '../renderer/index.html');
  const splashPath = path.join(__dirname, '../renderer/splash.html');
  const preloadPath = path.join(__dirname, '../preload/index.js');

  log.info('App startup diagnostics', {
    isDev,
    isPackaged: app.isPackaged,
    appPath: app.getAppPath(),
    userDataPath: app.getPath('userData'),
    logsPath: app.getPath('logs'),
    resourcesPath: process.resourcesPath,
    backendPath,
    backendPathExists: fs.existsSync(backendPath),
    backendEntries: fs.existsSync(backendPath) ? fs.readdirSync(backendPath).slice(0, 20) : [],
    rendererIndexPath,
    rendererIndexExists: fs.existsSync(rendererIndexPath),
    splashPath,
    splashExists: fs.existsSync(splashPath),
    preloadPath,
    preloadExists: fs.existsSync(preloadPath),
  });
}

function showStartupError(title: string, error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  const logsPath = app.getPath('logs');
  log.error(`${title}:`, error);
  dialog.showErrorBox(title, `${message}\n\n日志目录: ${logsPath}`);
}

function setupAutoUpdater() {
  autoUpdater.autoDownload = false;

  autoUpdater.on('checking-for-update', () => {
    if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('update-message', 'Checking for update...');
  });

  autoUpdater.on('update-available', (info) => {
    if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('update-available', info);
  });

  autoUpdater.on('update-not-available', () => {
    if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('update-message', 'Update not available.');
  });

  autoUpdater.on('error', (err) => {
    if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('update-error', err.message);
  });

  autoUpdater.on('download-progress', (progressObj) => {
    if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('update-download-progress', progressObj);
  });

  autoUpdater.on('update-downloaded', () => {
    if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('update-downloaded');
  });

  ipcMain.handle('check-for-update', () => autoUpdater.checkForUpdatesAndNotify());
  ipcMain.handle('download-update', () => autoUpdater.downloadUpdate());
  ipcMain.handle('install-update', () => autoUpdater.quitAndInstall());

  ipcMain.handle('install-local-update', async () => {
    const { canceled, filePaths } = await dialog.showOpenDialog({
      title: '选择本地更新包 (.exe)',
      filters: [{ name: 'Executables', extensions: ['exe'] }],
      properties: ['openFile']
    });

    if (canceled || filePaths.length === 0) return { success: false, message: '已取消' };

    const updatePath = filePaths[0];

    try {
      spawn(updatePath, [], {
        detached: true,
        stdio: 'ignore'
      }).unref();

      app.quit();
      return { success: true };
    } catch (err: any) {
      return { success: false, message: err.message };
    }
  });
}

function handleIPC() {
  ipcMain.on('window-minimize', () => { if (mainWindow && !mainWindow.isDestroyed()) mainWindow.minimize() });
  ipcMain.on('window-maximize', () => { if (mainWindow && !mainWindow.isDestroyed()) mainWindow.maximize() });
  ipcMain.on('window-unmaximize', () => { if (mainWindow && !mainWindow.isDestroyed()) mainWindow.unmaximize() });
  ipcMain.on('window-close', () => { app.quit(); });
  ipcMain.handle('window-is-maximized', () => { return (mainWindow && !mainWindow.isDestroyed()) ? mainWindow.isMaximized() : false });
}

function createTray() {
  const iconPath = isDev
    ? path.join(app.getAppPath(), 'resources/icon.png')
    : path.join(__dirname, '../../resources/icon.png');

  const trayIcon = fs.existsSync(iconPath) ? iconPath : nativeImage.createEmpty();
  try {
    tray = new Tray(trayIcon);
  } catch (e) {
    log.error('Failed to create tray:', e);
    return;
  }
  const contextMenu = Menu.buildFromTemplate([
    { label: '显示主界面', click: () => { if (mainWindow && !mainWindow.isDestroyed()) mainWindow.show() } },
    { type: 'separator' },
    { label: '退出', click: () => {
        sidecar.stop().then(() => app.quit());
    }}
  ]);
  tray.setToolTip('Second Brain AI');
  tray.setContextMenu(contextMenu);
}

function createSplashWindow() {
  splashWindow = new BrowserWindow({
    width: 600,
    height: 400,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    center: true,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true
    }
  });

  splashWindow.webContents.on('did-start-loading', () => {
    log.info('Splash window started loading');
  });
  splashWindow.webContents.on('did-finish-load', () => {
    log.info('Splash window finished load:', splashWindow?.webContents.getURL());
  });
  splashWindow.webContents.on('did-fail-load', (event, errorCode, errorDescription, validatedURL) => {
    log.error(`Splash window failed to load: ${errorCode} - ${errorDescription} at ${validatedURL}`);
  });

  if (isDev && process.env['ELECTRON_RENDERER_URL']) {
    splashWindow.loadURL(`${process.env['ELECTRON_RENDERER_URL']}/splash.html`);
  } else {
    splashWindow.loadFile(path.join(__dirname, '../renderer/splash.html'));
  }

  splashWindow.on('closed', () => {
    splashWindow = null;
  });
}

function createWindow() {
  const iconPath = isDev
    ? path.join(app.getAppPath(), 'resources/icon.png')
    : path.join(__dirname, '../../resources/icon.png');

  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    frame: false,
    show: false,
    transparent: true,
    icon: fs.existsSync(iconPath) ? iconPath : undefined,
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      nodeIntegration: false,
      contextIsolation: true
    }
  });

  mainWindow.webContents.on('did-start-loading', () => {
    log.info('Main window started loading');
  });
  mainWindow.webContents.on('did-finish-load', () => {
    log.info('Main window finished load:', mainWindow?.webContents.getURL());
  });
  mainWindow.webContents.on('did-fail-load', (event, errorCode, errorDescription, validatedURL) => {
    log.error(`Main window failed to load: ${errorCode} - ${errorDescription} at ${validatedURL}`);
    if (isDev) {
      log.info('ELECTRON_RENDERER_URL:', process.env['ELECTRON_RENDERER_URL']);
    }
  });
  mainWindow.webContents.on('crashed', (event, killed) => {
    log.error(`Main window crashed: killed=${killed}`);
  });
  mainWindow.webContents.on('render-process-gone', (event, details) => {
    log.error(`Main window render process gone: ${details.reason} (${details.exitCode})`);
  });
  mainWindow.on('unresponsive', () => {
    log.error('Main window became unresponsive');
  });

  mainWindow.webContents.on('console-message', (event, level, message, line, sourceId) => {
    log.info(`Renderer Console: [${level}] ${message} (${sourceId}:${line})`);
  });

  if (isDev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL']);
  } else {
    mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));
  }

  mainWindow.once('ready-to-show', () => {
    log.info('Main window ready-to-show');
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.whenReady().then(() => {
  logStartupContext();
  createSplashWindow();
  createWindow();

  createTray();
  handleIPC();
  setupAutoUpdater();

  sidecar.start()
    .then(() => {
      log.info('Sidecar started successfully.');
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.show();
      }
      if (splashWindow && !splashWindow.isDestroyed()) {
        splashWindow.close();
      }
    })
    .catch((err) => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.show();
      }
      if (splashWindow && !splashWindow.isDestroyed()) {
        splashWindow.close();
      }
      showStartupError('Second Brain AI 启动失败', err);
    });

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
      if (sidecar.isAlive()) {
        mainWindow?.show();
      }
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('before-quit', async () => {
  log.info('Shutting down Sidecar...');
  await sidecar.stop();
});

import log from 'electron-log';
import { app, BrowserWindow, Tray, Menu, ipcMain, dialog, nativeImage } from 'electron';
import path from 'path';
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


// 确保 backend 路径计算准确
const getBackendPath = () => {
  if (isDev) {
    return path.join(app.getAppPath(), 'backend');
  }
  // 生产环境下 backend 可执行文件通常在 resources/backend 目录
  return path.join(process.resourcesPath, 'backend');
};

const sidecar = new SidecarManager(getBackendPath(), isDev);

// 初始化自动更新
function setupAutoUpdater() {
  autoUpdater.autoDownload = false; // 询问用户后再下载

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

  // 本地离线更新机制
  ipcMain.handle('install-local-update', async () => {
    const { canceled, filePaths } = await dialog.showOpenDialog({
      title: '选择本地更新包 (.exe)',
      filters: [{ name: 'Executables', extensions: ['exe'] }],
      properties: ['openFile']
    });

    if (canceled || filePaths.length === 0) return { success: false, message: '已取消' };

    const updatePath = filePaths[0];
    
    try {
      // 启动安装程序并退出当前应用
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
  
  // Check if icon exists, else use empty image to prevent crash
  const fs = require('fs');
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

  if (isDev && process.env['ELECTRON_RENDERER_URL']) {
    splashWindow.loadURL(`${process.env['ELECTRON_RENDERER_URL']}/splash.html`);
  } else {
    splashWindow.loadFile(path.join(__dirname, '../renderer/splash.html'));
  }

  // Add error logging
  splashWindow.webContents.on('did-fail-load', (event, errorCode, errorDescription, validatedURL) => {
    log.error(`Splash window failed to load: ${errorCode} - ${errorDescription} at ${validatedURL}`);
  });

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
    show: false, // 初始不显示，等待 ready-to-show
    transparent: true,
    icon: require('fs').existsSync(iconPath) ? iconPath : undefined,
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      nodeIntegration: false,
      contextIsolation: true
    }
  });

  // Add error logging
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

  // Add console message logging
  mainWindow.webContents.on('console-message', (event, level, message, line, sourceId) => {
    log.info(`Renderer Console: [${level}] ${message} (${sourceId}:${line})`);
  });

  if (isDev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL']);
  } else {
    mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));
  }

  mainWindow.once('ready-to-show', () => {
    // wait for sidecar to show
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.whenReady().then(() => {
  createSplashWindow();
  createWindow();
  
  createTray();
  handleIPC();
  setupAutoUpdater();

  // 异步启动 Sidecar，不阻塞主窗口创建过程
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
      log.error('Failed to start sidecar:', err);
      // 即便后端启动失败，也尝试显示主窗口，以便用户看到界面进行反馈或展示错误提示
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.show();
      }
      if (splashWindow && !splashWindow.isDestroyed()) {
        splashWindow.close();
      }
    });

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
      // 如果 sidecar 已经在运行，直接显示
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

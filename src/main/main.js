const { app, BrowserWindow, dialog, session } = require('electron');
const { startServer } = require('../../server');

let server;

async function createWindow() {
  if (!server) {
    server = await startServer({ host: '127.0.0.1' });
  }

  const address = server.address();
  const port = typeof address === 'object' && address ? address.port : 3000;
  const mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1100,
    minHeight: 760,
    backgroundColor: '#050811',
    title: 'CyberGuard AI',
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  mainWindow.loadURL(`http://127.0.0.1:${port}`);
}

app.whenReady().then(() => {
  session.defaultSession.setPermissionRequestHandler((webContents, permission, callback) => {
    const isLocalApp = webContents.getURL().startsWith('http://127.0.0.1:');
    callback(isLocalApp && permission === 'media');
  });

  return createWindow();
}).catch((error) => {
  dialog.showErrorBox('CyberGuard AI could not start', error.message);
  app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow().catch((error) => {
      dialog.showErrorBox('CyberGuard AI could not start', error.message);
      app.quit();
    });
  }
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

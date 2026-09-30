// Isolated Windows Electron renderer fixture. Never load a real account or production bridge.
const { app, BrowserWindow, session } = require('electron');
const { mkdtempSync } = require('node:fs');
const { tmpdir } = require('node:os');
const { join } = require('node:path');
app.setPath('userData', mkdtempSync(join(tmpdir(), 'blow-recovery-test-')));
app.disableHardwareAcceleration();
app.whenReady().then(async () => {
  session.defaultSession.webRequest.onBeforeRequest((details, callback) => {
    const url = new URL(details.url);
    callback({ cancel: !['127.0.0.1', 'localhost'].includes(url.hostname) && !['data:', 'blob:', 'devtools:'].includes(url.protocol) });
  });
  const window = new BrowserWindow({ show: false, width: 1366, height: 900, webPreferences: { nodeIntegration: false, contextIsolation: true, sandbox: true } });
  await window.loadURL('http://127.0.0.1:4180/preview.html?state=ready');
});
app.on('window-all-closed', () => app.quit());

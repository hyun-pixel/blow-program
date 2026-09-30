// node apps/desktop/scripts/check-packaged-login.cjs [path/to/app.asar]
// Real packaged renderer/preload, isolated profile, no login submission or external traffic.
const { resolve, join } = require('node:path');
const { mkdtempSync, mkdirSync } = require('node:fs');
const { tmpdir } = require('node:os');

if (process.versions.electron) {
  const { app, BrowserWindow, session } = require('electron');
  const archive = process.argv[2];
  app.setPath('userData', mkdtempSync(join(tmpdir(), 'blow-packaged-login-')));
  app.disableHardwareAcceleration();
  app.whenReady().then(async () => {
    session.defaultSession.webRequest.onBeforeRequest((details, callback) => {
      callback({ cancel: !['file:', 'data:', 'devtools:'].includes(new URL(details.url).protocol) });
    });
    const window = new BrowserWindow({ show: false, width: 1280, height: 820,
      webPreferences: { preload: join(archive, 'out/preload/index.cjs'), nodeIntegration: false, contextIsolation: true, sandbox: true } });
    await window.loadFile(join(archive, 'out/renderer/index.html'));
  }).catch(() => app.exit(1));
  app.on('window-all-closed', () => app.quit());
} else {
  (async () => {
    const assert = require('node:assert/strict');
    const { extractFile } = await import('@electron/asar');
    const { _electron } = await import('playwright-core');
    const archive = resolve(process.argv[2] || 'apps/desktop/release/win-unpacked/resources/app.asar');
    const version = JSON.parse(extractFile(archive, 'package.json').toString()).version;
    const app = await _electron.launch({ args: [__filename, archive] });
    try {
      const page = await app.firstWindow();
      const errors = [];
      page.on('pageerror', () => errors.push('renderer error'));
      await page.waitForURL(/out\/renderer\/index\.html$/);
      await page.getByRole('heading', { name: '계정에 로그인', exact: true }).waitFor();
      assert.equal(await page.getByText('앱 연결 설정이 필요합니다', { exact: true }).count(), 0);
      assert.equal(await page.locator('#auth-email').isEditable(), true);
      assert.equal(await page.locator('#auth-password').isEditable(), true);
      await page.locator('.auth-mode').getByRole('button', { name: '회원가입', exact: true }).click();
      await page.locator('#auth-password-confirmation').waitFor();
      await page.locator('.auth-mode').getByRole('button', { name: '로그인', exact: true }).click();
      assert.deepEqual(errors, []);
      mkdirSync('.local/packaged-login', { recursive: true });
      await page.screenshot({ path: `.local/packaged-login/login-${version}.png` });
      console.log(`PASS packaged ${version}: login form, editable fields, signup navigation; isolated profile, no login or external requests.`);
    } finally { await app.close(); }
  })().catch(error => {
    console.error('Packaged login screen check failed:', String(error.message).replace(/sb_(?:publishable|secret)_[A-Za-z0-9_-]+/g, '[redacted]'));
    process.exitCode = 1;
  });
}

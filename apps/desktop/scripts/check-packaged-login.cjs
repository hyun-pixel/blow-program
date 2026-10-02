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
      const checkLogo = async () => {
        const logo = page.getByRole('img', { name: 'BLOW', exact: true });
        await logo.waitFor();
        assert.equal(await logo.evaluate(image => image.complete && image.naturalWidth === 1024 && image.naturalHeight === 1024), true);
        assert.equal(await logo.evaluate(image => getComputedStyle(image).objectFit), 'cover');
        assert.equal(await page.locator('.wordmark-dot').count(), 0);
      };
      await checkLogo();
      assert.equal(await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--primary').trim()), '#087c3c');
      assert.equal(await page.locator('.auth-submit').evaluate(button => getComputedStyle(button).backgroundColor), 'rgb(8, 124, 60)');
      assert.equal(await page.getByText('앱 연결 설정이 필요합니다', { exact: true }).count(), 0);
      assert.equal(await page.locator('#auth-email').isEditable(), true);
      assert.equal(await page.locator('#auth-password').isEditable(), true);
      await page.locator('.auth-mode').getByRole('button', { name: '회원가입', exact: true }).click();
      await page.locator('#auth-password-confirmation').waitFor();
      await checkLogo();
      await page.locator('.auth-mode').getByRole('button', { name: '로그인', exact: true }).click();
      await page.getByRole('button', { name: '비밀번호 찾기', exact: true }).click();
      await page.getByRole('heading', { name: '비밀번호 재설정', exact: true }).waitFor();
      await checkLogo();
      assert.equal(await page.getByLabel('가입한 이메일', { exact: true }).isEditable(), true);
      await page.getByRole('button', { name: '로그인으로 돌아가기', exact: true }).click();
      await page.getByRole('heading', { name: '계정에 로그인', exact: true }).waitFor();
      assert.deepEqual(errors, []);
      mkdirSync('.local/packaged-login', { recursive: true });
      await page.screenshot({ path: `.local/packaged-login/login-${version}.png` });
      await page.setViewportSize({ width: 760, height: 620 });
      await checkLogo();
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true);
      await page.screenshot({ path: `.local/packaged-login/login-${version}-compact.png` });
      console.log(`PASS packaged ${version}: login, signup, password recovery navigation, new logo at normal/compact sizes; isolated profile, no login or external requests.`);
    } finally { await app.close(); }
  })().catch(error => {
    console.error('Packaged login screen check failed:', String(error.message).replace(/sb_(?:publishable|secret)_[A-Za-z0-9_-]+/g, '[redacted]'));
    process.exitCode = 1;
  });
}

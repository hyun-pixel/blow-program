// Real Chrome, synthetic pages only. All browser traffic is fulfilled locally or
// aborted; no Naver accounts, login attempts, cookies or CAPTCHA solving.
// Run: npx tsx apps/desktop/scripts/check-login-preservation.ts
import assert from 'node:assert/strict';
import { setTimeout as delay } from 'node:timers/promises';
import { chromium } from 'playwright-core';
import { NaverConnectionAdapter, parseNaverBlogUrl } from '../../../packages/naver-adapter/src/naver-connection.js';

const home = 'https://section.blog.naver.com/BlogHome.naver';
const login = 'https://nid.naver.com/nidlogin.login';
const profile = parseNaverBlogUrl('https://blog.naver.com/example');
const browser = await chromium.launch({ channel: 'chrome', headless: true });
try {
  const context = await browser.newContext({ serviceWorkers: 'block' });
  const requests: string[] = [];
  let authenticated = false;
  await context.route('**/*', async route => {
    const url = new URL(route.request().url());
    if (!['section.blog.naver.com', 'blog.naver.com', 'nid.naver.com'].includes(url.hostname)) return route.abort();
    requests.push(url.pathname);
    if (url.pathname === '/MyBlog.naver') return route.fulfill({
      status: 302, headers: { location: authenticated ? profile.canonicalUrl : login },
    });
    const body = url.hostname === 'nid.naver.com'
      ? '<h1>Local authentication fixture</h1><input id="manual-input" aria-label="Manual test input">'
      : '<a href="https://blog.naver.com/GoBlogWrite.naver">글쓰기</a>';
    return route.fulfill({ contentType: 'text/html; charset=utf-8', body });
  });
  const page = await context.newPage();
  const adapter = new NaverConnectionAdapter(page);
  await page.goto(home);
  const pending = adapter.waitForLoginAndVerify(profile, {
    timeoutMs: 8_000, settleDelayMs: 400, pollIntervalMs: 50,
  });
  // Move to auth after the wait starts: the original timing-dependent bug.
  await page.goto(login);
  await page.locator('#manual-input').fill('synthetic input to preserve');
  await delay(800);
  assert.equal(page.url(), login);
  assert.equal(await page.locator('#manual-input').inputValue(), 'synthetic input to preserve');
  assert.equal(requests.filter(path => path === '/MyBlog.naver').length, 0);
  assert.equal((await adapter.verifyRegisteredBlog(profile)).stage, 'LOGIN_REQUIRED');
  assert.equal(requests.filter(path => path === '/MyBlog.naver').length, 0);
  // A user-completed login may resume verification; we never solve a challenge.
  authenticated = true;
  await page.goto(home);
  assert.equal((await pending).stage, 'WRITER_LINK_READY');
  assert.equal(requests.filter(path => path === '/MyBlog.naver').length, 1);
  console.log('PASS: login transition/input preserved; verification resumes only after leaving auth.');

  await page.goto(login);
  const requestCount = requests.length;
  const status = await adapter.waitForLoginAndVerify(profile, {
    timeoutMs: 1_000, settleDelayMs: 0, pollIntervalMs: 10, waitForLogin: false,
  });
  assert.equal(status.stage, 'LOGIN_REQUIRED');
  const timedOut = await adapter.waitForLoginAndVerify(profile, {
    timeoutMs: 250, settleDelayMs: 0, pollIntervalMs: 25,
  }).catch(error => error);
  assert.equal(timedOut.code, 'LOGIN_WAIT_TIMEOUT');
  assert.equal(requests.length, requestCount);
  assert.equal(page.isClosed(), false);
  console.log('PASS: preflight/timeout perform zero navigation, reload or login requests.');

  const closed = adapter.waitForLoginAndVerify(profile, {
    timeoutMs: 1_000, settleDelayMs: 100, pollIntervalMs: 25,
  }).catch(error => error);
  await page.close();
  assert.match(String((await closed).message), /closed/);
  assert.equal(browser.isConnected(), true);
  console.log('PASS: closing the login tab stops waiting without closing Chrome.');
} finally {
  await browser.close();
}

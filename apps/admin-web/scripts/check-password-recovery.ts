// Isolated browser test: all auth calls are mocked; no email or account is changed.
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
import react from '@vitejs/plugin-react';
import { chromium, type Page } from 'playwright-core';

const root = fileURLToPath(new URL('../../..', import.meta.url));
const output = resolve(root, 'apps/admin-web/.local/recovery-check');
await mkdir(output, { recursive: true });
const server = await createServer({
  configFile: false,
  root: resolve(root, 'apps/admin-web'),
  envFile: false,
  define: {
    'import.meta.env.VITE_SUPABASE_URL': JSON.stringify('https://recovery-test.supabase.co'),
    'import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY': JSON.stringify('sb_publishable_test_only'),
  },
  server: { host: '127.0.0.1', port: 4188, strictPort: true, fs: { allow: [root] } },
  plugins: [react(), {
    name: 'desktop-auth-test-page',
    configureServer(vite) {
      vite.middlewares.use(async (req, res, next) => {
        if (req.url?.split('?')[0] !== '/desktop-auth.html') return next();
        const html = await vite.transformIndexHtml('/desktop-auth.html', `<!doctype html><html lang="ko"><head><meta name="viewport" content="width=device-width, initial-scale=1"></head><body><div id="root"></div><script type="module">
          import React from 'react';
          import { createRoot } from 'react-dom/client';
          import { AuthScreen } from '/@fs/${root.replaceAll('\\', '/')}/apps/desktop/src/renderer/AuthScreen.tsx';
          import '/@fs/${root.replaceAll('\\', '/')}/apps/desktop/src/renderer/styles.css';
          createRoot(document.getElementById('root')).render(React.createElement(React.StrictMode, null, React.createElement(AuthScreen)));
        </script></body></html>`);
        res.setHeader('Content-Type', 'text/html');
        res.end(html);
      });
    },
  }],
});
await server.listen();
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const failures: string[] = [];
let currentPage: Page | undefined;
const requests: string[] = [];
let assertions = 0;
const check = (condition: unknown, message: string) => { assert.ok(condition, message); assertions++; };
const user = { id: '00000000-0000-0000-0000-000000000001', aud: 'authenticated', role: 'authenticated', email: 'test@example.com', app_metadata: {}, user_metadata: {}, created_at: new Date().toISOString() };
const factor = { id: 'test-factor', factor_type: 'totp', status: 'verified', friendly_name: '테스트 인증 앱' };
const jwt = [Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url'), Buffer.from(JSON.stringify({ sub: user.id, exp: Math.floor(Date.now() / 1000) + 3600, aal: 'aal1' })).toString('base64url'), Buffer.from('test-signature').toString('base64url')].join('.');
const session = { access_token: jwt, refresh_token: 'test-only-refresh-token', token_type: 'bearer', expires_in: 3600, user };

async function ready(page: Page, text: string) {
  await page.getByRole('heading', { name: text, exact: true }).waitFor();
}

try {
  for (const app of ['admin', 'desktop'] as const) {
    for (const withMfa of [false, true]) {
      const context = await browser.newContext({ viewport: { width: 1000, height: 980 } });
      const page = await context.newPage();
      currentPage = page;
      await page.clock.install();
      page.setDefaultTimeout(10_000);
      page.on('pageerror', (error) => failures.push(error.message));
      let sendCount = 0;
      let updateCount = 0;
      let verifyCount = 0;
      let mfaCount = 0;
      let failSend = true;
      let failVerify = true;
      let failSecurity = true;
      let failMfa = true;
      let failUpdate = true;
      await page.route('https://recovery-test.supabase.co/**', async (route) => {
        const url = new URL(route.request().url());
        requests.push(`${route.request().method()} ${url.pathname}`);
        const body = route.request().postDataJSON();
        const respond = (data: unknown, status = 200) => route.fulfill({ status, contentType: 'application/json', headers: { 'X-Supabase-Api-Version': '2024-01-01', 'Access-Control-Allow-Origin': '*', 'Access-Control-Expose-Headers': 'X-Supabase-Api-Version' }, body: JSON.stringify(data) });
        if (url.pathname.endsWith('/recover')) {
          sendCount++;
          if (failSend) { failSend = false; return respond({ code: 'over_email_send_rate_limit', msg: 'rate limited' }, 429); }
          if (sendCount === 2) return route.abort('connectionrefused');
          return respond({});
        }
        if (url.pathname.endsWith('/verify') && !url.pathname.includes('/factors/')) {
          verifyCount++;
          check(body.type === 'recovery', 'must use recovery OTP, not signup or login OTP');
          if (failVerify) { failVerify = false; return respond({ code: 'otp_expired', msg: 'expired' }, 403); }
          return respond(session);
        }
        if (url.pathname.endsWith('/user') && route.request().method() === 'GET') {
          if (failSecurity) { failSecurity = false; return respond({ code: 'unexpected_failure', msg: 'retry lookup' }, 500); }
          return respond({ ...user, factors: withMfa ? [factor] : [] });
        }
        if (url.pathname.endsWith('/challenge')) return respond({ id: 'challenge', type: 'totp', expires_at: Math.floor(Date.now() / 1000) + 300 });
        if (url.pathname.includes('/factors/') && url.pathname.endsWith('/verify')) {
          mfaCount++;
          if (failMfa) { failMfa = false; return respond({ code: 'mfa_verification_failed', msg: 'bad totp' }, 422); }
          return respond(session);
        }
        if (url.pathname.endsWith('/user') && route.request().method() === 'PUT') {
          updateCount++;
          check(!withMfa || mfaCount === 2, 'MFA must pass before updating password');
          check(body.password === 'test-password-NEW', 'password must be passed unchanged');
          if (failUpdate) { failUpdate = false; return respond({ code: 'same_password', msg: 'same password' }, 422); }
          return respond(user);
        }
        if (url.pathname.endsWith('/logout')) return respond({});
        failures.push(`Unexpected auth request: ${route.request().method()} ${url.pathname}`);
        return respond({ code: 'unexpected_request' }, 400);
      });
      // Nothing may reach any real Supabase project during this test.
      await page.route(/https:\/\/(?!recovery-test\.supabase\.co)[^/]+\.supabase\.co\//, (route) => { failures.push('Real Supabase request blocked'); return route.abort(); });
      await page.goto(`http://127.0.0.1:4188/${app === 'desktop' ? 'desktop-auth.html' : ''}`);
      await page.getByRole('button', { name: '비밀번호 찾기', exact: true }).click();
      await ready(page, '비밀번호 재설정');
      await page.getByLabel('가입한 이메일', { exact: true }).fill('test@example.com');
      await page.getByRole('button', { name: '인증번호 받기', exact: true }).click();
      await page.getByRole('alert').filter({ hasText: '요청이 너무 많습니다' }).waitFor();
      check(await page.getByRole('button', { name: '인증번호 받기', exact: true }).isEnabled(), 'error must unlock input');
      await page.getByRole('button', { name: '인증번호 받기', exact: true }).click();
      await page.getByRole('alert').filter({ hasText: '인터넷 연결' }).waitFor();
      check(await page.getByRole('button', { name: '인증번호 받기', exact: true }).isEnabled(), 'network failure must unlock retry');
      await page.getByRole('button', { name: '인증번호 받기', exact: true }).click();
      await page.getByLabel('이메일 인증번호', { exact: true }).waitFor();
      check(await page.getByRole('button', { name: /초 후 다시 받기/ }).isDisabled(), 'resend cooldown must be active');
      await page.clock.fastForward(61_000);
      await page.getByRole('button', { name: '인증번호 다시 받기', exact: true }).click();
      await page.getByRole('button', { name: /초 후 다시 받기/ }).waitFor();
      check(sendCount === 4, 'resend must send one new email only after cooldown');
      await page.getByLabel('이메일 인증번호', { exact: true }).fill('000000');
      await page.getByRole('button', { name: '인증번호 확인', exact: true }).click();
      await page.getByRole('alert').filter({ hasText: '만료되었습니다' }).waitFor();
      await page.getByLabel('이메일 인증번호', { exact: true }).fill('123456');
      await page.getByRole('button', { name: '인증번호 확인', exact: true }).click();
      await page.getByRole('button', { name: '보안 상태 다시 확인' }).waitFor();
      await page.getByRole('button', { name: '보안 상태 다시 확인' }).click();
      check(verifyCount === 2, 'consumed OTP must not be verified again after lookup failure');
      if (withMfa) {
        await page.getByLabel('인증 앱 번호', { exact: true }).fill('123456');
        await page.getByRole('button', { name: '추가 인증 확인' }).click();
        await page.getByRole('alert').filter({ hasText: '인증 앱의 최신' }).waitFor();
        check(updateCount === 0, 'no password update on failed MFA');
        await page.getByLabel('인증 앱 번호', { exact: true }).fill('654321');
        await page.getByRole('button', { name: '추가 인증 확인' }).click();
      }
      await page.getByLabel('새 비밀번호', { exact: true }).fill('test-password-NEW');
      await page.getByLabel('새 비밀번호 확인', { exact: true }).fill('mismatched-password');
      await page.getByRole('button', { name: '새 비밀번호 저장' }).click();
      await page.getByRole('alert').filter({ hasText: '일치하지 않습니다' }).waitFor();
      check(updateCount === 0, 'mismatched confirmation must not be sent');
      await page.getByLabel('새 비밀번호 확인', { exact: true }).fill('test-password-NEW');
      await page.getByRole('button', { name: '새 비밀번호 저장' }).click();
      await page.getByRole('alert').filter({ hasText: '현재 비밀번호와 다른' }).waitFor();
      await page.getByRole('button', { name: '새 비밀번호 저장' }).click();
      await ready(page, '비밀번호를 변경했습니다');
      check(await page.evaluate(() => Object.keys(localStorage).every((key) => !key.includes('auth-token') && !key.includes('password-recovery'))), 'no recovery tokens may persist');
      await page.screenshot({ path: resolve(output, `${app}-${withMfa ? 'mfa' : 'normal'}-done.png`) });
      await page.getByRole('button', { name: '로그인으로 돌아가기' }).click();
      await ready(page, app === 'admin' ? '관리자 로그인' : '계정에 로그인');
      check(sendCount === 4 && updateCount === 2, 'only explicit user actions may send requests');
      await page.setViewportSize({ width: 375, height: 812 });
      await page.getByRole('button', { name: '비밀번호 찾기', exact: true }).click();
      check(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), 'no mobile horizontal overflow');
      await page.screenshot({ path: resolve(output, `${app}-mobile.png`) });
      await context.close();
      console.log(`PASS ${app}: ${withMfa ? 'MFA' : 'email'} recovery, error retries, session isolation, mobile layout`);
    }
  }
  assert.deepEqual(failures, []);
  console.log(`PASS ${assertions} browser assertions; all auth requests mocked.`);
} catch (error) {
  console.error({ requests, failures, screen: await currentPage?.locator('body').innerText() });
  throw error;
} finally {
  await browser.close();
  await server.close();
}

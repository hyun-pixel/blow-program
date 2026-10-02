// Uses the existing :4180 mocked preview. No accounts, credentials, or external requests.
import { chromium } from 'playwright-core';
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';

const browser = await chromium.launch({ channel: 'chrome', headless: true });
const page = await browser.newPage({ viewport: { width: 1366, height: 900 } });
page.setDefaultTimeout(10_000);
const errors = [];
page.on('pageerror', error => errors.push(error.message));
await page.route('**/*', async route => {
  const url = new URL(route.request().url());
  if (url.hostname === '127.0.0.1' && url.pathname.includes('__x00__blow-preview-supabase')) {
    const response = await route.fetch();
    return route.fulfill({ response, body: (await response.text()) + '\nexport const createPasswordRecoveryClient = () => null;' });
  }
  if (url.hostname === '127.0.0.1' || ['data:', 'blob:'].includes(url.protocol)) return route.continue();
  errors.push('Unexpected external request');
  return route.abort();
});
const recommend = () => page.getByRole('button', { name: '내용 작성 추천 받기', exact: true });
const setup = async () => {
  await page.locator('#naver-blog-url').fill('https://blog.naver.com/example');
  await page.getByRole('button', { name: '전용 Chrome 열기', exact: true }).click();
  await page.getByRole('button', { name: '연결됐어요, 새 글 작성', exact: true }).click();
};
try {
  for (const mode of ['models-reject', 'models-timeout', 'profile-reject']) {
    await page.goto('http://127.0.0.1:4180/preview.html?state=ready');
    await page.locator('#naver-blog-url').waitFor();
    await page.evaluate(mode => {
      window.__savedModels = window.blowOpenAi.listModels;
      window.__savedProfile = window.blowBrandProfile.get;
      if (mode === 'models-reject') window.blowOpenAi.listModels = async () => { throw new Error('sensitive diagnostic'); };
      if (mode === 'profile-reject') window.blowBrandProfile.get = async () => { throw new Error('sensitive diagnostic'); };
      if (mode === 'models-timeout') {
        const timer = window.setTimeout;
        window.setTimeout = (fn, ms, ...args) => timer(fn, ms === 20_000 ? 100 : ms, ...args);
        window.blowOpenAi.listModels = () => new Promise(resolve => { window.__lateModels = resolve; });
      }
    }, mode);
    await setup();
    await page.locator('#new-post-topic').fill('다시 연결해도 유지할 주제');
    const retry = page.getByRole('button', { name: '추천 준비 다시 확인', exact: true });
    await retry.waitFor();
    assert.equal(await recommend().isDisabled(), true);
    assert.equal((await page.locator('body').innerText()).includes('sensitive diagnostic'), false);
    if (mode === 'models-timeout') {
      await page.evaluate(async () => window.__lateModels(await window.__savedModels()));
      assert.equal(await recommend().isDisabled(), true, 'late response cannot clear a failed check');
    }
    await page.evaluate(() => {
      window.blowOpenAi.listModels = window.__savedModels;
      window.blowBrandProfile.get = window.__savedProfile;
    });
    await retry.click();
    await page.waitForFunction(() => !document.querySelector('.topic-recommendations button')?.disabled);
    assert.equal(await recommend().isEnabled(), true);
    assert.equal(await page.locator('#new-post-topic').inputValue(), '다시 연결해도 유지할 주제');
    assert.equal(await page.evaluate(() => window.__previewCalls.length), 0);
    console.log('PASS recovery without paid calls: ' + mode);
  }

  await page.evaluate(() => {
    window.__previewNaverEmit({ ok: false, error: { code: 'BROWSER_CLOSED', message: '전용 Chrome 연결이 끊겼습니다. [BROWSER_CLOSED]' } });
  });
  await page.getByRole('heading', { name: '네이버를 먼저 연결해 주세요' }).waitFor();
  await page.getByRole('button', { name: '네이버 연결하러 가기' }).click();
  await setup();
  assert.equal(await page.locator('#new-post-topic').inputValue(), '다시 연결해도 유지할 주제');
  console.log('PASS disconnected state and explicit reconnection preserve the topic');

  await page.locator('#new-post-article-type').selectOption('정보형');
  await page.locator('#new-post-keyword-0').fill('카페');
  await page.locator('#new-post-model').selectOption('gpt-5.6-terra');
  await page.locator('#new-post-reasoning').selectOption('medium');
  await page.evaluate(() => {
    window.blowNaver.prepareAutomaticWriter = async () => {
      const response = { ok: false, error: { code: 'BROWSER_CLOSED', message: '연결이 끊겼습니다. [BROWSER_CLOSED]' } };
      window.__previewNaverEmit(response);
      return response;
    };
  });
  await page.getByRole('button', { name: '이 글 자동 작성·저장', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: '자동 작성 시작', exact: true }).click();
  await page.getByRole('heading', { name: '네이버를 먼저 연결해 주세요' }).waitFor();
  const savedQueue = await page.evaluate(() => JSON.parse(localStorage.getItem('blow:writing-queue:v1:preview-user')));
  assert.equal(savedQueue[0].status, 'failed');
  assert.match(savedQueue[0].message, /BROWSER_CLOSED/);
  assert.equal(await page.evaluate(() => window.__previewCalls.filter(c => ['draft', 'images', 'save'].includes(c.type)).length), 0);
  await page.getByRole('button', { name: '네이버 연결하러 가기' }).click();
  await setup();
  await page.locator('.queue-job.is-failed').waitFor();
  assert.equal(savedQueue[0].config.request.topic, '다시 연결해도 유지할 주제');
  await page.locator('.queue-job.is-failed').getByRole('button', { name: '설정 불러오기', exact: true }).click();
  assert.equal(await page.locator('#new-post-topic').inputValue(), '다시 연결해도 유지할 주제');
  await mkdir('.local/connection-recovery', { recursive: true });
  await page.screenshot({ path: '.local/connection-recovery/recovered.png', fullPage: true });
  assert.deepEqual(errors, []);
  console.log('PASS failed preflight spends nothing; reconnect preserves queue and topic; no renderer errors');
} catch (error) {
  console.error('Renderer failures:', errors);
  throw error;
} finally {
  await browser.close();
}

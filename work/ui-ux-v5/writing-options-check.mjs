import { chromium } from 'playwright-core';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const browser = await chromium.launch({ channel: 'chrome', headless: true });
const page = await browser.newPage({ viewport: { width: 1366, height: 900 } });
page.setDefaultTimeout(12000);
const errors = [], results = [];
const dir = 'work/ui-ux-v5';
fs.mkdirSync(dir, { recursive: true });
page.on('pageerror', e => errors.push(String(e)));
await page.route('**/*', route => {
  const url = new URL(route.request().url());
  if (['127.0.0.1', 'localhost'].includes(url.hostname) || ['data:', 'blob:'].includes(url.protocol)) return route.continue();
  errors.push('Unexpected external request: ' + url.origin);
  return route.abort();
});
const check = async (name, run) => { await run(); results.push(name); console.log('PASS ' + name); };
const nav = name => page.locator('.sidebar').getByRole('button', { name, exact: true });
const model = page.locator('#new-post-model');
const length = page.locator('#new-post-target-length');
const effort = page.locator('#new-post-reasoning');
const screenshot = async (name, heading) => {
  await page.locator(heading).evaluate(n => window.scrollTo(0, n.getBoundingClientRect().top + scrollY - 104));
  await page.screenshot({ path: dir + '/writing-options-' + name + '.png' });
};
try {
  await page.goto('http://127.0.0.1:4180/preview.html?state=ready');
  await page.locator('#naver-blog-url').fill('https://blog.naver.com/example');
  await page.getByRole('button', { name: '전용 Chrome 열기', exact: true }).click();
  await page.getByRole('button', { name: '연결됐어요, 새 글 작성', exact: true }).click();

  await check('Six requested lengths with 1800 default and keyboard selection', async () => {
    assert.deepEqual(await length.locator('option').evaluateAll(nodes => nodes.map(n => n.value)), ['700','1000','1500','1800','2000','2500']);
    assert.equal(await length.inputValue(), '1800');
    await length.focus();
    await page.keyboard.press('Home');
    assert.equal(await length.inputValue(), '700');
    await screenshot('length', '#compose-section-03');
  });

  await check('Removed keyword suggestions and per-post CTA; manual keywords and topic suggestions remain', async () => {
    assert.equal(await page.locator('.new-post-keyword-recommendation, #new-post-recommendation-count, #new-post-cta').count(), 0);
    assert.equal(await page.getByRole('heading', { name: '마지막 안내 문구', exact: true }).count(), 0);
    assert.equal(await page.getByRole('button', { name: '내용 작성 추천 받기', exact: true }).count(), 1);
    assert.equal(await page.locator('#new-post-keyword-0').count(), 1);
    assert.deepEqual(await page.locator('.compose-section-number').allTextContents(), ['01','02','03','04','05','06','07','08','09','10']);
    await screenshot('keywords', '#compose-section-04');
  });

  await check('Three real model names and supported reasoning levels', async () => {
    assert.deepEqual(await model.locator('option[value]:not([value=""])').evaluateAll(nodes => nodes.map(n => [n.value, n.textContent.trim()])), [
      ['gpt-6-astra', 'GPT-6 Astra'],
      ['gpt-5.6-terra', 'GPT-5.6 Terra (권장)'],
      ['gpt-5.6-luna', 'GPT-5.6 Luna'],
    ]);
    await model.selectOption('gpt-6-astra');
    assert.equal(await effort.locator('option[value="none"]').count(), 0);
    await model.selectOption('gpt-5.6-terra');
    assert.equal(await effort.locator('option[value="none"]').count(), 1);
    await effort.selectOption('medium');
    await screenshot('models', '#compose-section-06');
    assert.equal((await page.evaluate(() => window.__previewCalls.filter(c => c.type === 'draft' || c.type === 'topics'))).length, 0);
  });

  await page.locator('#new-post-topic').fill('처음 방문하는 고객에게 카페를 소개해 주세요.');
  await page.locator('#new-post-article-type').selectOption('정보형');
  await page.locator('#new-post-keyword-0').fill('카페');
  await check('All six length values reach the existing generation payload unchanged', async () => {
    for (const value of ['700','1000','1500','1800','2000','2500']) {
      await length.selectOption(value);
      await page.getByRole('button', { name: '글 만들기', exact: true }).click();
      await page.getByRole('button', { name: '확인했어요, 임시저장으로' }).waitFor();
      const data = await page.evaluate(() => window.__previewCalls.filter(c => c.type === 'draft').at(-1).data);
      assert.equal(data.targetLength, Number(value));
      assert.equal(data.modelId, 'gpt-5.6-terra');
      assert.equal(data.reasoningEffort, 'medium');
      assert.equal(data.cta, '');
      assert.deepEqual(data.keywords, [{ value: '카페', repetitions: 3 }]);
    }
  });

  await check('Each real model ID reaches generation without substitution', async () => {
    for (const id of ['gpt-5.6-luna','gpt-5.6-terra','gpt-6-astra']) {
      await model.selectOption(id);
      await effort.selectOption('low');
      await page.getByRole('button', { name: '글 만들기', exact: true }).click();
      await page.getByRole('button', { name: '확인했어요, 임시저장으로' }).waitFor();
      assert.equal(await page.evaluate(() => window.__previewCalls.filter(c => c.type === 'draft').at(-1).data.modelId), id);
    }
  });

  await check('Key availability still filters options and invalidates unavailable saved preferences', async () => {
    await nav('블로그 세팅').click();
    await page.evaluate(() => { window.blowOpenAi.listModels = async () => ({ ok:true, modelIds:['gpt-5.6-luna'] }); });
    await nav('새 글 작성').click();
    await page.waitForFunction(() => document.querySelectorAll('#new-post-model option').length === 2);
    assert.equal(await model.inputValue(), '');
    assert.deepEqual(await model.locator('option').evaluateAll(nodes => nodes.map(n => n.value)), ['', 'gpt-5.6-luna']);
    assert.match(await page.locator('.new-post-model-notice').innerText(), /다시 선택/);
  });

  await check('An API key without an approved writing model shows a safe error', async () => {
    await nav('블로그 세팅').click();
    await page.evaluate(() => { window.blowOpenAi.listModels = async () => ({ ok:true, modelIds:[] }); });
    await nav('새 글 작성').click();
    await page.getByRole('heading', { name:'새 글 작성', exact:true }).waitFor();
    await page.locator('.new-post-model-error').getByText('현재 API 키에서 사용할 수 있는 BLOW 허용 모델이 없습니다.', { exact:false }).waitFor();
    assert.equal(await model.isDisabled(), true);
  });
  assert.deepEqual(errors, []);
  fs.writeFileSync(dir + '/writing-options-results.json', JSON.stringify({ results, errors, externalServices:'Blocked; preview fixtures only' }, null, 2));
  console.log('All ' + results.length + ' writing-option checks passed; no paid calls.');
} finally { await browser.close(); }

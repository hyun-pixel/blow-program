// Requires the local, mocked UI preview on :4180. No real credentials, AI or Naver requests.
// node apps/desktop/scripts/check-writing-recovery.mjs [--electron]
import { chromium, _electron } from 'playwright-core';
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const electronMode = process.argv.includes('--electron');
const app = electronMode ? await _electron.launch({ args: [fileURLToPath(new URL('./recovery-preview.cjs', import.meta.url))] }) : null;
const browser = app ? null : await chromium.launch({ channel: 'chrome', headless: true });
const page = app ? await app.firstWindow() : await browser.newPage({ viewport: { width: 1366, height: 900 }, reducedMotion: 'reduce' });
page.setDefaultTimeout(10000);
const errors = [], results = [];
const output = `.local/writing-recovery-${electronMode ? 'electron' : 'chrome'}`;
mkdirSync(output, { recursive: true });
page.on('pageerror', error => errors.push(String(error)));
page.on('dialog', async dialog => { errors.push('Unexpected native confirmation'); await dialog.dismiss(); });
await page.route('**/*', route => {
  const url = new URL(route.request().url());
  if (['127.0.0.1', 'localhost'].includes(url.hostname) || ['data:', 'blob:'].includes(url.protocol)) return route.continue();
  errors.push('Unexpected external request: ' + url.origin); return route.abort();
});
const calls = type => page.evaluate(t => window.__previewCalls.filter(c => c.type === t), type);
const nav = name => page.locator('.sidebar').getByRole('button', { name, exact: true });
const queue = () => page.evaluate(() => JSON.parse(localStorage.getItem('blow:writing-queue:v1:preview-user')));
const setup = async () => {
  await page.locator('#naver-blog-url').fill('https://blog.naver.com/example');
  await page.getByRole('button', { name: '전용 Chrome 열기', exact: true }).click();
  await page.getByRole('button', { name: '연결됐어요, 새 글 작성', exact: true }).click();
  await page.locator('#new-post-model option[value="gpt-5.6-terra"]').waitFor({ state: 'attached' });
};
const fresh = async () => {
  await page.goto('http://127.0.0.1:4180/preview.html?state=ready');
  await page.evaluate(() => localStorage.clear()); // This browser/profile is created just for this test.
  await page.reload(); await setup();
};
const fill = async (topic = '실패 후 다시 작성할 카페 안내') => {
  await page.locator('#new-post-topic').fill(topic);
  await page.locator('#new-post-article-type').selectOption('정보형');
  await page.locator('#new-post-target-length').selectOption('1800');
  await page.locator('#new-post-keyword-0').fill('카페');
  await page.locator('#new-post-model').selectOption('gpt-5.6-terra');
  await page.locator('#new-post-reasoning').selectOption('medium');
};
const add = () => page.getByRole('button', { name: '목록에 추가', exact: true }).click();
const approve = () => page.getByRole('dialog', { name: '자동 작성을 시작할까요?', exact: true }).getByRole('button', { name: '자동 작성 시작', exact: true }).click();
const retryDialog = () => page.getByRole('dialog', { name: '이 글을 다시 생성할까요?', exact: true });
const removeDialog = () => page.getByRole('dialog', { name: '작성 목록에서 삭제할까요?', exact: true });
const typeAfterClick = async text => {
  const topic = page.locator('#new-post-topic');
  assert.equal(await topic.isDisabled(), false);
  await topic.click(); await page.keyboard.press('Control+A'); await page.keyboard.type(text);
  assert.equal(await topic.inputValue(), text, 'Input must accept real keyboard events without restarting');
};
const failOne = async () => {
  await page.evaluate(() => {
    window.__originalGenerate = window.blowOpenAi.generateDraft;
    window.blowOpenAi.generateDraft = async data => {
      const result = await window.__originalGenerate(data);
      return { ...result, verification: { ...result.verification, valid: false, issues: ['제목이 최대 30자를 넘었습니다.'] } };
    };
  });
  await fill();
  await page.getByRole('button', { name: '이 글 자동 작성·저장', exact: true }).click();
  await approve(); await page.locator('.queue-job.is-failed').waitFor();
};
const check = async (name, run) => { await run(); results.push(name); console.log('PASS ' + name); };
try {
  await fresh(); await failOne();
  const original = (await queue())[0];
  await check('Failure unlocks the form; retry cancellation spends nothing and restores keyboard focus', async () => {
    await typeAfterClick('editable after failure');
    const button = page.locator('.queue-job.is-failed').getByRole('button', { name: '재생성', exact: true });
    await button.click();
    assert.match(await retryDialog().innerText(), /사용료.*발생/s);
    assert.match(await retryDialog().innerText(), /중복 저장/);
    assert.equal(await retryDialog().getByRole('button', { name: '취소' }).evaluate(el => el === document.activeElement), true);
    await page.keyboard.press('Escape');
    await retryDialog().waitFor({ state: 'hidden' });
    assert.equal(await button.evaluate(el => el === document.activeElement), true);
    assert.deepEqual(await queue(), [original]);
    assert.equal((await calls('draft')).length, 1);
    await typeAfterClick('editable after cancellation');
  });
  await check('Retry copies all settings, preserves the failed draft, and only runs the selected job once', async () => {
    await fill('다른 대기 글'); await add();
    await page.evaluate(() => {
      window.blowOpenAi.generateDraft = async data => {
        const result = await window.__originalGenerate(data);
        return { ...result, draft: { ...result.draft, body: '카페 카페' + '가'.repeat(1542) }, verification: { ...result.verification, warnings: ['본문이 공백 제외 1,546자로, 목표 범위 1,620–1,980자를 벗어났습니다.', '본문 키워드 ‘카페’: 설정 3회 / 실제 2회.'] } };
      };
    });
    await page.locator('.queue-job.is-failed').getByRole('button', { name: '재생성', exact: true }).click();
    if (!electronMode) {
      await page.screenshot({ path: `${output}/retry-desktop.png` });
      await page.setViewportSize({ width: 375, height: 812 });
      assert.ok(await retryDialog().evaluate(el => el.scrollWidth <= el.clientWidth + 1));
      await page.screenshot({ path: `${output}/retry-small.png` });
      await page.setViewportSize({ width: 844, height: 390 });
      await page.evaluate(() => document.documentElement.style.fontSize = '200%');
      assert.ok(await retryDialog().evaluate(el => el.scrollWidth <= el.clientWidth + 1 && el.getBoundingClientRect().bottom <= innerHeight));
      await page.evaluate(() => document.documentElement.style.fontSize = '');
      await page.setViewportSize({ width: 1366, height: 900 });
    }
    await retryDialog().getByRole('button', { name: '확인 후 재생성 시작' }).evaluate(el => { el.click(); el.click(); });
    await page.locator('.queue-job.is-saved').waitFor();
    const jobs = await queue();
    assert.deepEqual(jobs[0], original);
    assert.equal(jobs[1].status, 'queued');
    assert.deepEqual(jobs[2].config, original.config);
    assert.notEqual(jobs[2].id, original.id);
    assert.equal((await calls('draft')).length, 2);
    assert.equal((await calls('save')).length, 1);
    assert.equal(await page.locator('.queue-job.is-saved').getByRole('button', { name: '재생성', exact: true }).count(), 0);
    await page.locator('.queue-job.is-saved').getByRole('note', { name: '작성 결과 안내' }).waitFor();
    assert.match(await page.locator('.queue-job.is-saved').innerText(), /설정 3회 \/ 실제 2회/);
    assert.deepEqual((await calls('history-add'))[0].data.warnings, jobs[2].warnings);
    await typeAfterClick('editable after retry');
  });
  await check('Length and keyword reports are visible in history and survive queue reload without auto retry', async () => {
    await nav('작업 내역').click();
    await page.getByRole('button', { name: '상세 보기' }).click();
    assert.match(await page.locator('.history-detail').innerText(), /1,546자/);
    await page.getByRole('note', { name: '작성 결과 안내' }).waitFor();
    assert.match(await page.locator('.history-detail').innerText(), /설정 3회 \/ 실제 2회/);
    if (!electronMode) await page.screenshot({ path: `${output}/keyword-history.png` });
    await page.getByRole('button', { name: '기록 삭제', exact: true }).click();
    await page.getByRole('dialog', { name: '작업 내역을 삭제할까요?' }).getByRole('button', { name: '취소', exact: true }).click();
    assert.equal(await page.getByRole('button', { name: '기록 삭제', exact: true }).evaluate(el => el === document.activeElement), true);
    await page.reload(); await setup();
    await page.locator('.queue-job.is-saved').getByRole('note', { name: '작성 결과 안내' }).waitFor();
    assert.match(await page.locator('.queue-job.is-saved').innerText(), /설정 3회 \/ 실제 2회/);
    assert.equal((await calls('draft')).length, 0);
  });
  await check('Failed settings can be loaded and edited without deleting the original', async () => {
    await page.locator('.queue-job.is-failed').getByRole('button', { name: '설정 불러오기' }).click();
    assert.equal(await page.locator('#new-post-topic').inputValue(), original.config.request.topic);
    assert.equal(await page.locator('#new-post-model').inputValue(), original.config.request.modelId);
    assert.equal(await page.locator('#new-post-target-length').inputValue(), String(original.config.request.targetLength));
    assert.deepEqual((await queue())[0], original);
    await typeAfterClick('loaded settings remain editable');
  });
  await check('Repeated in-app delete cancel/confirm keeps inputs clickable, without a restart or native dialog', async () => {
    while (await page.locator('.queue-job').count()) {
      const button = page.locator('.queue-job').first().getByRole('button', { name: '목록에서 삭제', exact: true });
      const count = await page.locator('.queue-job').count();
      await button.click(); await page.keyboard.press('Escape');
      assert.equal(await page.locator('.queue-job').count(), count);
      assert.equal(await button.evaluate(el => el === document.activeElement), true);
      await button.click();
      await removeDialog().getByRole('button', { name: '목록에서 삭제', exact: true }).click();
      assert.equal(await page.locator('.queue-job').count(), count - 1);
      assert.equal(await page.locator('#new-post-topic').evaluate(el => el === document.activeElement), true);
      await typeAfterClick('can type after deletion ' + count);
    }
    await fill('삭제 후 새 글'); await add();
    assert.equal(await page.locator('.queue-job').count(), 1);
    assert.equal((await calls('draft')).length, 0);
  });
  await check('Retry storage errors spend nothing and leave existing records and form usable', async () => {
    await fresh(); await failOne();
    const before = await queue();
    await page.locator('.queue-job.is-failed').getByRole('button', { name: '재생성', exact: true }).click();
    await page.evaluate(() => { window.__setItem = Storage.prototype.setItem; Storage.prototype.setItem = () => { throw new Error('test disk full'); }; });
    await retryDialog().getByRole('button', { name: '확인 후 재생성 시작' }).click();
    await page.locator('#writing-queue').getByRole('alert').filter({ hasText: '진행 상황을 저장하지 못했습니다' }).waitFor();
    assert.equal((await calls('draft')).length, 1);
    assert.deepEqual(await queue(), before);
    await typeAfterClick('editable after storage failure');
    await page.evaluate(() => Storage.prototype.setItem = window.__setItem);
  });
  await check('Interrupted and full queues cannot trigger implicit paid reruns', async () => {
    await page.evaluate(() => {
      const key = 'blow:writing-queue:v1:preview-user';
      const first = JSON.parse(localStorage.getItem(key))[0];
      localStorage.setItem(key, JSON.stringify(Array.from({ length: 20 }, (_, i) => ({ ...first, id: 'test-' + i, status: i === 0 ? 'running' : 'saved' }))));
    });
    await page.reload(); await setup();
    const interrupted = page.locator('.queue-job.is-interrupted');
    await interrupted.getByRole('button', { name: '재생성', exact: true }).click();
    await page.locator('#writing-queue').getByRole('alert').filter({ hasText: '가득 찼습니다' }).waitFor();
    assert.equal(await retryDialog().isVisible(), false);
    assert.equal((await calls('draft')).length, 0);
    await typeAfterClick('editable with full queue');
  });
  await check('Confirmed save with history failure can retry history only after reload, without AI or duplicate saving', async () => {
    await fresh(); await fill('작업 내역 복구 테스트');
    await page.evaluate(() => { window.blowWorkHistory.add = async () => ({ ok: false, error: { message: '테스트용 기록 실패' } }); });
    await page.getByRole('button', { name: '이 글 자동 작성·저장', exact: true }).click();
    await approve();
    const retryHistory = () => page.getByRole('button', { name: '작업 내역 다시 기록', exact: true });
    await retryHistory().waitFor();
    assert.equal((await queue())[0].status, 'saved');
    assert.equal((await queue())[0].historyPending, true);
    assert.equal((await calls('draft')).length, 1);
    assert.equal((await calls('save')).length, 1);
    await retryHistory().click();
    await page.locator('#writing-queue').getByRole('alert').filter({ hasText: '테스트용 기록 실패' }).waitFor();
    assert.equal((await queue())[0].historyPending, true);
    await typeAfterClick('editable after history failure');
    await page.reload(); await setup();
    await retryHistory().waitFor();
    await page.evaluate(() => {
      const originalAdd = window.blowWorkHistory.add;
      window.__historyAttempts = 0;
      window.blowWorkHistory.add = async (...args) => { window.__historyAttempts++; await new Promise(resolve => setTimeout(resolve, 200)); return originalAdd(...args); };
    });
    await retryHistory().evaluate(el => { el.click(); el.click(); });
    await page.getByText('네이버 임시저장 완료 · 작업 내역 기록 완료. 글 재생성이나 네이버 재저장은 하지 않았습니다.', { exact: true }).waitFor();
    assert.equal(await page.evaluate(() => window.__historyAttempts), 1);
    assert.equal((await queue())[0].historyPending, false);
    assert.equal((await calls('draft')).length, 0);
    assert.equal((await calls('save')).length, 0);
    assert.equal((await calls('history-add')).length, 1);
    assert.equal(await retryHistory().count(), 0);
    await nav('작업 내역').click();
    assert.equal(await page.getByRole('button', { name: '상세 보기', exact: true }).count(), 1);
  });
  await check('API-key deletion cancellation uses the same safe focus-return dialog', async () => {
    await nav('블로그 세팅').click();
    const button = page.getByRole('button', { name: '저장된 키 삭제', exact: true });
    await button.click();
    await page.getByRole('dialog', { name: '저장된 API 키를 삭제할까요?' }).getByRole('button', { name: '취소', exact: true }).click();
    assert.equal(await button.evaluate(el => el === document.activeElement), true);
    await page.locator('#openai-api-key').click(); await page.keyboard.type('test-only-not-a-real-key');
    assert.equal(await page.locator('#openai-api-key').inputValue(), 'test-only-not-a-real-key');
  });
  assert.deepEqual(errors, []);
  writeFileSync(`${output}/results.json`, JSON.stringify({ checks: results, errors }, null, 2));
  console.log(`PASS ${results.length} recovery checks (${electronMode ? 'Windows Electron' : 'Chrome'}); no external requests.`);
} finally {
  if (app) await app.close(); else await browser.close();
}

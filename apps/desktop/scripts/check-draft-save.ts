import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';
import { NaverDraftSaveAdapter } from '../../../packages/naver-adapter/src/naver-draft-save.js';
import { runAutomaticWriting } from '../src/renderer/automatic-writing.js';
import { defaultPostDecorations } from '../src/renderer/post-decoration.js';
import type { WritingJob } from '../src/renderer/writing-queue.js';

// Developer-owned page, separate browser, external requests blocked. No paid AI or real Naver changes.
const Adapter: typeof NaverDraftSaveAdapter = process.argv.includes('--baseline')
  ? (await import(new URL('../../../.local/naver-draft-save-0.1.9.js', import.meta.url).href)).NaverDraftSaveAdapter
  : NaverDraftSaveAdapter;
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const page = await browser.newPage();
page.setDefaultTimeout(750);
await page.route('**/*', route => route.abort());
await page.route('https://blog.naver.com/PostWriteFormSe2TempSaveAsync.naver', route => route.fulfill({
  status: 200, headers: { 'Access-Control-Allow-Origin': '*' }, body: '{}',
}));
const pageErrors: string[] = [];
page.on('pageerror', error => pageErrors.push(error.message));

async function fixture(mode: string) {
  await page.setContent(`<!doctype html><html lang="ko"><meta charset="utf-8">
    <section id="extra">${Array.from({ length: 80 }, (_, i) => `<button>도구 ${i}</button>`).join('')}</section>
    <div><button id="save">저장</button><button id="count" aria-label="임시저장 목록">${mode === 'accessible-label' ? '4 임시저장 목록' : '4'}</button></div>
    <button id="publish">발행</button><div role="status">${mode === 'stale' ? '임시저장 완료' : ''}</div>
    <div class="se-component se-text" contenteditable="true"><p>원문은 변경하지 않습니다.</p></div></html>`);
  await page.evaluate(mode => {
    (window as any).saveClicks = 0; (window as any).publishClicks = 0;
    document.querySelector('#publish')!.addEventListener('click', () => (window as any).publishClicks++);
    document.querySelector('#save')!.addEventListener('click', () => {
      (window as any).saveClicks++;
      if (mode === 'http-only') void fetch('https://blog.naver.com/PostWriteFormSe2TempSaveAsync.naver', { method: 'POST' });
      if (mode === 'replaced') {
        document.querySelector('#extra')!.remove();
        const save = document.querySelector('#save')!;
        save.replaceWith(save.cloneNode(true));
      }
      setTimeout(() => {
        if (mode === 'count' || mode === 'replaced' || mode === 'accessible-label') {
          const count = document.querySelector('#count')!;
          count.textContent = String(parseInt(count.textContent!, 10) + 1) + (mode === 'accessible-label' ? ' 임시저장 목록' : '');
        }
        if (mode === 'decreased') document.querySelector('#count')!.textContent = '3';
        if (mode === 'short-toast') {
          document.querySelector('[role=status]')!.textContent = '저장되었습니다.';
          setTimeout(() => { document.querySelector('[role=status]')!.textContent = ''; }, 300);
        }
      }, 150);
    });
  }, mode);
  return new Adapter(page);
}

try {
  for (const mode of ['count', 'replaced', 'short-toast', 'accessible-label']) {
    const adapter = await fixture(mode);
    const started = performance.now();
    const result = await adapter.saveAndVerify();
    assert.equal(result.stage, 'DRAFT_SAVE_COMPLETED');
    assert.ok(performance.now() - started < 5_000, 'Save proof must resolve promptly, without scanning stale button indexes');
    assert.equal(await page.evaluate(() => (window as any).saveClicks), 1);
    assert.equal(await page.evaluate(() => (window as any).publishClicks), 0);
    assert.equal(await page.locator('p').textContent(), '원문은 변경하지 않습니다.');
    console.log(`PASS ${mode}: confirmed promptly; one save click; no publication or content changes.`);
  }
  for (const mode of ['http-only', 'stale', 'decreased']) {
    const adapter = await fixture(mode);
    const started = performance.now();
    await assert.rejects(adapter.saveAndVerify(), { code: 'DRAFT_SAVE_UNCONFIRMED' });
    assert.ok(performance.now() - started < 13_000, 'Observation deadline includes browser reads');
    assert.equal(await page.evaluate(() => (window as any).saveClicks), 1);
    assert.equal(await page.evaluate(() => (window as any).publishClicks), 0);
    console.log(`PASS ${mode}: not falsely completed; bounded observation; no re-click.`);
  }

  const adapter = await fixture('count');
  const order: string[] = [], updates: WritingJob[] = [];
  const job: WritingJob = {
    id: 'first', status: 'queued', message: '',
    config: { blogId: 'example', modelName: 'Test', reasoningLabel: '중간',
      request: { userId: 'test-user', topic: '카페 안내', articleType: '정보형', targetLength: 1800, keywords: [{ value: '카페', repetitions: 3 }], service: '', cta: '', modelId: 'gpt-5.6-terra', reasoningEffort: 'medium' },
      decorations: structuredClone(defaultPostDecorations),
      images: { enabled: false, count: 1, aspectRatio: 'landscape', qualityMode: 'economy', style: '' } },
  };
  const bridges = {
    blowNaver: {
      prepareAutomaticWriter: async () => { order.push('writer'); return { ok: true, status: { stage: 'WRITER_READY', registeredBlogId: 'example' } }; },
      enterContent: async () => { order.push('input'); return { ok: true }; },
      saveDraft: async () => { order.push('save'); return { ok: true, result: await adapter.saveAndVerify() }; },
    },
    blowOpenAi: { generateDraft: async () => { order.push('generate'); return { ok: true, draft: { title: '카페 안내', body: '첫 번째 설명입니다.\n\n마지막 설명입니다.' }, verification: { valid: true, issues: [], warnings: [] } }; } },
    blowWorkHistory: { add: async () => { order.push('history'); return { ok: true }; } },
  } as unknown as Pick<Window, 'blowNaver' | 'blowOpenAi' | 'blowWorkHistory'>;
  for (const current of [job, { ...job, id: 'second' }]) {
    await runAutomaticWriting(current, bridges, new AbortController().signal, update => updates.push(update));
  }
  assert.deepEqual(order, ['writer', 'generate', 'input', 'save', 'history', 'writer', 'generate', 'input', 'save', 'history']);
  assert.deepEqual([...new Set(updates.filter(update => update.status === 'saved').map(update => update.id))], ['first', 'second']);
  assert.equal(await page.evaluate(() => (window as any).saveClicks), 2);
  assert.equal(await page.evaluate(() => (window as any).publishClicks), 0);
  assert.deepEqual(pageErrors, []);
  console.log('PASS two jobs: real save verification → saved status → history → next job; no duplicate generation or saves (all AI/history mocked).');
} finally { await browser.close(); }

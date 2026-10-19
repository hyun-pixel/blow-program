import assert from 'node:assert/strict';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium, type Page } from 'playwright-core';
import { NaverEditorAdapter } from '../../../packages/naver-adapter/src/naver-editor.js';
import { NaverImageAdapter } from '../../../packages/naver-adapter/src/naver-image.js';
import { NaverDraftSaveAdapter } from '../../../packages/naver-adapter/src/naver-draft-save.js';
import { runAutomaticWriting } from '../src/renderer/automatic-writing.js';
import { defaultPostDecorations } from '../src/renderer/post-decoration.js';
import { readWritingQueue, saveWritingQueue, type WritingJob } from '../src/renderer/writing-queue.js';

// Local rich editor + real input/image/save adapters. AI/history are stubs;
// all network requests are blocked. Faults simulate lost input, not Naver's implementation.
const baseline = process.argv.includes('--baseline');
const Adapter: typeof NaverEditorAdapter = baseline
  ? (await import(new URL('../../../.local/naver-editor-0.1.18.ts', import.meta.url).href)).NaverEditorAdapter
  : NaverEditorAdapter;
const browser = await chromium.launch({ channel: 'chrome', headless: true, chromiumSandbox: true });
const context = await browser.newContext();
await context.route('**/*', route => route.abort());
const directory = await mkdtemp(join(tmpdir(), 'blow-writing-batch-'));
const imagePath = join(directory, 'local.png');
await writeFile(imagePath, Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a5H0AAAAASUVORK5CYII=', 'base64'));
const errors: string[] = [];
context.on('page', page => page.on('pageerror', error => errors.push(error.message)));

async function fixture(mode: string, frame = false): Promise<Page> {
  const page = await context.newPage();
  const html = `<!doctype html><meta charset="utf-8"><style>
body{font:16px/1.6 sans-serif;padding:30px;width:700px}p{min-height:26px}.se-image{height:60px}
</style><div class="se-section-documentTitle" contenteditable></div>
<div class="se-component se-text"><div class="se-section-text" contenteditable><p class="se-text-paragraph"><br></p></div></div>
<input type="file" accept="image/png" multiple hidden>
<button id="save">저장</button><button id="count">임시저장 0</button><button id="publish">발행</button><div role="status"></div>`;
  await page.setContent(frame ? '<iframe style="width:100%;height:900px"></iframe>' : html);
  const editor = frame ? (await (await page.locator('iframe').elementHandle())!.contentFrame())! : page.mainFrame();
  if (frame) await editor.setContent(html);
  await editor.evaluate(mode => {
    const state = (window as any).testState = { inputs: 0, repairs: 0, saves: 0, uploads: 0, publishes: 0 };
    const body = document.querySelector('.se-section-text')!;
    let faulted = false, delayed = false;
    body.addEventListener('beforeinput', event => {
      const input = event as InputEvent;
      if (mode === 'delayed' && input.inputType === 'insertText' && !delayed) {
        delayed = true;
        event.preventDefault();
        setTimeout(() => document.execCommand('insertText', false, input.data!), 350);
      }
      if (input.inputType === 'insertText' && !getSelection()?.isCollapsed) state.repairs++;
    });
    body.addEventListener('input', event => {
      if ((event as InputEvent).inputType !== 'insertText') return;
      state.inputs++;
      const selection = getSelection()!;
      const paragraph = selection.anchorNode?.parentElement?.closest('p');
      if (!paragraph) return;
      const isPrefixFault = mode === 'prefix' && body.querySelectorAll('p').length >= 3;
      const lateFault = mode === 'missing-late' && body.querySelectorAll('p').length >= 3;
      const repeatedFault = mode === 'two-faults' && state.inputs !== 2;
      if ((!faulted && ['missing', 'missing-all', 'foreign', 'cancel-repair', 'race-repair'].includes(mode)) || mode === 'permanent' || repeatedFault || (!faulted && (isPrefixFault || lateFault))) {
        faulted = true;
        const target = isPrefixFault ? body.querySelector('p')! : paragraph;
        target.textContent = mode === 'foreign' ? target.textContent + '외부변경' : mode === 'missing-all' ? '' : target.textContent!.slice(3);
        selection.selectAllChildren(paragraph); selection.collapseToEnd();
      }
    });
    if (mode === 'race-repair' || mode === 'cancel-repair') document.addEventListener('selectionchange', () => {
      const selection = getSelection();
      if (faulted && selection && !selection.isCollapsed) {
        if (mode === 'cancel-repair') void (window as any).cancelInput();
        else body.querySelector('p')!.textContent += '새로운변경';
      }
    });
    document.querySelector('input')!.addEventListener('change', event => {
      state.uploads++;
      let anchor = getSelection()!.anchorNode!.parentElement!.closest('p')!;
      for (const file of (event.target as HTMLInputElement).files!) {
        const image = document.createElement('div'); image.className = 'se-component se-image';
        image.contentEditable = 'false'; image.textContent = file.name; anchor.after(image); anchor = image as any;
      }
    });
    document.querySelector('#save')!.addEventListener('click', () => {
      state.saves++;
      setTimeout(() => {
        document.querySelector('#count')!.textContent = '임시저장 ' + state.saves;
        document.querySelector('[role=status]')!.textContent = '저장되었습니다.';
      }, 150);
    });
    document.querySelector('#publish')!.addEventListener('click', () => state.publishes++);
  }, mode);
  return page;
}

const template: WritingJob = {
  id: '', status: 'queued', message: '',
  config: { blogId: 'example', modelName: 'Test', reasoningLabel: '중간',
    request: { userId: 'test-user', topic: '카페 안내', articleType: '정보형', targetLength: 1800, keywords: [{ value: '안내', repetitions: 1 }], service: '', cta: '', modelId: 'gpt-5.6-terra', reasoningEffort: 'medium' },
    decorations: structuredClone(defaultPostDecorations),
    images: { enabled: true, count: 1, aspectRatio: 'landscape', qualityMode: 'economy', style: '' } },
};
const safetyOnly = process.argv.includes('--safety-only');
const jobCount = safetyOnly ? 0 : baseline ? 2 : 20;
const jobs = Array.from({ length: jobCount }, (_, index) => ({ ...structuredClone(template), id: `job-${index + 1}` }));
let currentPage: Page, content: { title: string; paragraphs: readonly string[] }, generated = 0, images = 0, history = 0;
const savedPages: Page[] = [];
let persisted = '';
const storage = { setItem: (_key: string, value: string) => { persisted = value; }, getItem: () => persisted };
const bridges = {
  blowNaver: {
    prepareAutomaticWriter: async () => {
      assert.equal(history, generated, 'Previous job must finish before next editor opens');
      const mode = [1, 10, 19].includes(generated) ? 'missing' : generated > 0 && generated % 5 === 0 ? 'delayed' : 'normal';
      currentPage = await fixture(mode, generated % 2 === 1);
      return { ok: true, status: { stage: 'WRITER_READY', registeredBlogId: 'example' } };
    },
    enterContent: async (draft: typeof content) => { content = draft; return { ok: true, result: await new Adapter(currentPage).enterAndVerify(draft) }; },
    prepareGeneratedImages: async () => ({ ok: true, canceled: false, files: [{ id: 'local' }] }),
    attachImages: async (_ids: string[], _layout: string, positions: number[]) => ({ ok: true, result: await new NaverImageAdapter(currentPage).attachAtParagraphs([imagePath], content.paragraphs, positions) }),
    saveDraft: async () => {
      await new Adapter(currentPage).verifyCurrent(content);
      const result = await new NaverDraftSaveAdapter(currentPage).saveAndVerify();
      savedPages.push(currentPage);
      return { ok: true, result };
    },
  },
  blowOpenAi: {
    generateDraft: async () => {
      generated++;
      const paragraph = '방문 전에 이용 조건과 준비물을 확인해 주세요. 한글·English·1234·🙂, “안내”와 10–20% 표기를 그대로 유지합니다. 연속  공백과\t탭도 빠지지 않아야 합니다.';
      return { ok: true, draft: { title: `연속 작성 ${generated}번째 검증`, body: Array.from({ length: baseline ? 2 : 15 }, (_, index) => `${index + 1}번 안내입니다. ${paragraph}`).join('\n\n') }, verification: { valid: true, issues: [], warnings: [] } };
    },
    generateImages: async () => { images++; return { ok: true, images: [{ dataUrl: 'local-fixture-only' }] }; },
  },
  blowWorkHistory: { add: async () => { history++; return { ok: true }; } },
} as unknown as Pick<Window, 'blowNaver' | 'blowOpenAi' | 'blowWorkHistory'>;

try {
  for (const [index, job] of jobs.entries()) {
    await runAutomaticWriting(job, bridges, new AbortController().signal, update => {
      jobs[index] = update;
      saveWritingQueue(storage, 'test-user', jobs);
    });
    assert.equal(jobs[index]!.status, 'saved');
    console.log(`PASS ${index + 1}/${jobCount}: real editor input, exact verification, image placement, one confirmed save, history.`);
  }
  assert.equal(generated, jobCount); assert.equal(images, jobCount); assert.equal(history, jobCount);
  assert.equal(readWritingQueue(storage, 'test-user').filter(job => job.status === 'saved').length, jobCount);
  for (const page of savedPages) {
    const editor = page.frames().at(-1)!;
    const state = await editor.evaluate(() => (window as any).testState);
    assert.equal(state.saves, 1); assert.equal(state.uploads, 1); assert.equal(state.publishes, 0);
    assert.ok(state.repairs <= 1, 'Bounded repair, no duplicate input or paid regeneration');
  }
  if (jobCount) assert.equal(await context.pages()[0]!.locator('#save').count(), 1, 'Previous editor tabs are preserved');

  for (const mode of ['missing-late', 'missing-all']) {
    const page = await fixture(mode);
    const draft = { title: '복구 검증', paragraphs: ['앞 문단은 완전히 보존합니다.', '마지막 문단의 글자도 정확히 복구합니다.'] };
    await new Adapter(page).enterAndVerify(draft);
    await new Adapter(page).verifyCurrent(draft);
    assert.equal(await page.locator('.se-section-text').innerText().then(text => text.replace(/\n+/g, '\n')), draft.paragraphs.join('\n'));
    console.log(`PASS recovery ${mode}: exact original text, preceding paragraphs preserved.`);
  }
  for (const mode of ['permanent', 'two-faults', 'foreign', 'prefix', 'cancel-repair', 'race-repair']) {
    const page = await fixture(mode);
    const controller = new AbortController();
    await page.exposeFunction('cancelInput', () => controller.abort());
    await assert.rejects(new Adapter(page).enterAndVerify({ title: '안전 중단', paragraphs: ['첫 문단을 완전히 보존합니다.', '둘째 문단도 보존합니다.'] }, controller.signal),
      error => ['EDITOR_INPUT_MISMATCH', 'EDITOR_INPUT_INTERRUPTED'].includes((error as any).code));
    const state = await page.evaluate(() => (window as any).testState);
    assert.equal(state.saves, 0); assert.equal(state.uploads, 0); assert.equal(state.publishes, 0);
    assert.ok(state.repairs <= (['permanent', 'two-faults'].includes(mode) ? 1 : 0));
    console.log(`PASS safety ${mode}: no unsafe replacement, no save/publish, bounded attempts.`);
  }
  assert.deepEqual(errors, []);
  console.log(`PASS: ${jobCount}-job batch and safety checks; zero real AI/Naver requests.`);
} finally { await browser.close(); }

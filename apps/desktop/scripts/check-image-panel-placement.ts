import assert from 'node:assert/strict';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium, type Frame } from 'playwright-core';
import { NaverImageAdapter } from '../../../packages/naver-adapter/src/naver-image.js';
import { placeCaretAtParagraphEdge } from '../../../packages/naver-adapter/src/naver-editor-selection.js';
import { classifyNaverFailure } from '../src/main/naver-connection.js';

// Real browser, local fixture and tiny PNGs only. Never connects to Naver or AI.
const paragraphs = [
  '첫 번째 이미지 앞의 본문입니다.',
  '첫 번째 이미지 뒤의 본문입니다.',
  '두 번째 이미지 앞의 본문입니다.',
  '마지막 본문은 변경하지 않습니다.',
];
const html = `<!doctype html><meta charset="utf-8"><style>
body{margin:0;padding:40px 8vw;font:16px/1.6 sans-serif}
.se-section-text{width:80vw}p{min-height:26px;margin:24px 0}
.se-image{height:180px;background:#dceee4}
#library{display:none;position:fixed;right:0;top:0;width:24vw;height:100vh;background:white;z-index:10}
#library.cover-all{width:100vw}#library:after{content:'라이브러리 테스트 패널'}
</style><div class="se-component se-text"><div class="se-section-text" contenteditable="true">
${paragraphs.map(text => `<p class="se-text-paragraph">${text}</p>`).join('')}
</div></div><input type="file" accept="image/png" multiple hidden><aside id="library"></aside>
<button id="save">저장</button><button id="publish">발행</button>
<script>
window.uploads=0;window.saveClicks=0;window.publishClicks=0;window.openLibrary=true;
document.querySelector('input').onchange=event=>{
  window.uploads++;
  let anchor=getSelection().anchorNode?.parentElement?.closest('p');
  if(!anchor) throw new Error('Missing paragraph caret');
  for(const file of event.target.files){
    const image=document.createElement('div');image.className='se-component se-image';
    image.contentEditable='false';image.textContent=file.name;anchor.after(image);anchor=image;
  }
  if(window.openLibrary) document.querySelector('#library').style.display='block';
};
document.querySelector('#save').onclick=()=>window.saveClicks++;
document.querySelector('#publish').onclick=()=>window.publishClicks++;
</script>`;
const directory = await mkdtemp(join(tmpdir(), 'blow-image-panel-'));
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a5H0AAAAASUVORK5CYII=', 'base64');
const paths = [join(directory, 'first.png'), join(directory, 'second.png')];
await Promise.all(paths.map(path => writeFile(path, png)));
const browser = await chromium.launch({ channel: 'chrome', headless: true, chromiumSandbox: true });
const page = await browser.newPage();
await page.route('**/*', route => route.abort());
page.setDefaultTimeout(2_000);

async function loadFixture(iframe: boolean, zoom: number): Promise<Frame> {
  await page.setContent(iframe ? '<iframe style="border:0;width:100%;height:850px"></iframe>' : html);
  const frame = iframe ? (await page.locator('iframe').elementHandle())! : null;
  const editor = frame ? (await frame.contentFrame())! : page.mainFrame();
  if (iframe) await editor.setContent(html);
  await editor.evaluate(scale => { document.body.style.zoom = String(scale); }, zoom);
  return editor;
}

try {
  for (const scenario of [
    { width: 1000, height: 900, zoom: 1, iframe: false, panel: false },
    { width: 1000, height: 900, zoom: 1, iframe: false, panel: true },
    { width: 900, height: 700, zoom: 1.25, iframe: false, panel: true },
    { width: 1280, height: 720, zoom: 1.5, iframe: false, panel: true },
    { width: 1000, height: 900, zoom: 1, iframe: true, panel: true },
  ]) {
    await page.setViewportSize({ width: scenario.width, height: scenario.height });
    const editor = await loadFixture(scenario.iframe, scenario.zoom);
    await editor.evaluate(panel => { (window as any).openLibrary = panel; }, scenario.panel);
    const result = await new NaverImageAdapter(page).attachAtParagraphs(paths, paragraphs, [1, 3]);
    assert.equal(result.insertedCount, 2);
    assert.deepEqual(await editor.locator('p').allTextContents(), paragraphs);
    assert.deepEqual(await editor.locator('.se-section-text > *').evaluateAll(nodes => nodes.map(node => node.classList.contains('se-image') ? 'image' : 'text')), ['text', 'image', 'text', 'text', 'image', 'text']);
    assert.equal(await editor.evaluate(() => (window as any).uploads), 2, 'No duplicate uploads');
    assert.equal(await editor.evaluate(() => (window as any).saveClicks + (window as any).publishClicks), 0);
    if (scenario.panel) {
      assert.equal(await editor.locator('#library').isVisible(), true, 'Panel was not forcibly dismissed');
      const blocked = await editor.locator('p').nth(2).evaluate(element => {
        const box = element.getBoundingClientRect();
        return box.right - 2 >= innerWidth || element.ownerDocument.elementFromPoint(box.right - 2, Math.max(2, Math.min(innerHeight - 2, box.top + 2)))?.id === 'library';
      });
      assert.equal(blocked, true, 'Old right-edge target is covered or outside the zoomed viewport');
    }
    console.log(`PASS: two images, unchanged paragraphs, no retry/save/publish: ${JSON.stringify(scenario)}`);
  }

  await page.setViewportSize({ width: 1000, height: 900 });
  const editor = await loadFixture(false, 1);
  const anchor = editor.locator('p').first();
  for (const edge of ['before', 'after'] as const) {
    await editor.locator('#library').evaluate(element => { (element as HTMLElement).style.display = 'block'; });
    await placeCaretAtParagraphEdge(page, anchor, edge);
    const offset = await anchor.evaluate(element => element.ownerDocument.getSelection()?.anchorOffset);
    assert.equal(offset, edge === 'before' ? 0 : paragraphs[0]!.length);
  }
  console.log('PASS: shared caret helper still verifies both paragraph edges with library open.');

  await editor.locator('#library').evaluate(element => element.classList.add('cover-all'));
  await assert.rejects(new NaverImageAdapter(page).attachAtParagraphs(paths, paragraphs, [1, 3]), error => {
    assert.equal(classifyNaverFailure(error, true).code, 'NAVER_OPERATION_TIMEOUT');
    return true;
  });
  assert.equal(await editor.evaluate(() => (window as any).uploads), 0);
  assert.deepEqual(await editor.locator('p').allTextContents(), paragraphs);
  console.log('PASS: fully blocked editor stops with operation-timeout, without force-clicking or uploading.');

  const controller = new AbortController(); controller.abort();
  await assert.rejects(new NaverImageAdapter(page).attachAtParagraphs(paths, paragraphs, [1, 3], controller.signal), { code: 'IMAGE_UPLOAD_INTERRUPTED' });
  assert.equal(await editor.evaluate(() => (window as any).uploads), 0);
  console.log('PASS: cancellation still prevents input.');
} finally { await browser.close(); }

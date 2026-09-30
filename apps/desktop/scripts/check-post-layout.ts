import assert from 'node:assert/strict';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium } from 'playwright-core';
import { NaverEditorAdapter } from '../../../packages/naver-adapter/src/naver-editor.js';
import { NaverImageAdapter } from '../../../packages/naver-adapter/src/naver-image.js';
import { NaverDraftSaveAdapter } from '../../../packages/naver-adapter/src/naver-draft-save.js';
import { formatMobileParagraphs, planInlineImages } from '../src/renderer/mobile-post-layout.js';

// Developer-owned editor fixture, isolated browser. No real Naver traffic, account or paid AI.
const html = `<!doctype html><html lang="ko"><meta charset="utf-8"><style>
body{font:16px/1.6 sans-serif;max-width:560px;margin:32px auto;padding:16px}p{margin:16px 0;min-height:24px}.se-image{height:100px;background:#edf4ff;border:1px solid #c2d3ef}button{padding:12px;margin:8px}</style>
<div class="se-section-documentTitle" contenteditable="true"></div>
<div class="se-component se-text"><div class="se-section-text" contenteditable="true"><p class="se-text-paragraph"><br></p></div></div>
<input type="file" accept="image/png" multiple hidden>
<button id="save">저장</button><button id="list">임시저장 0</button><button id="publish">발행</button><div role="status"></div>
<script>
window.saveClicks=0;window.publishClicks=0;window.misplace=false;window.mode='success';
document.querySelector('input').onchange=event=>{
 const selection=getSelection();let anchor=selection.anchorNode?.parentElement?.closest('p');
 for(const file of event.target.files){const image=document.createElement('div');image.className='se-component se-image';image.contentEditable='false';image.textContent=file.name;
 if(window.misplace){document.querySelector('.se-section-text').append(image);}else{anchor.after(image);anchor=image;}}
};
document.querySelector('#publish').onclick=()=>window.publishClicks++;
document.querySelector('#save').onclick=()=>{window.saveClicks++;if(window.mode==='success')setTimeout(()=>{document.querySelector('#list').textContent='임시저장 1';document.querySelector('[role=status]').textContent='저장되었습니다.';},2100);};
</script></html>`;
const directory = await mkdtemp(join(tmpdir(), 'blow-post-layout-'));
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a5H0AAAAASUVORK5CYII=', 'base64');
const imagePaths = [join(directory, 'first.png'), join(directory, 'second.png'), join(directory, 'third.png')];
await Promise.all(imagePaths.map(path => writeFile(path, png)));
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const page = await browser.newPage({ viewport: { width: 900, height: 900 } });
await page.route('**/*', route => route.abort());
try {
  await page.setContent(html);
  const body = '방문 전 확인할 내용을 쉽게 안내합니다. 처음 이용하시는 분도 편하게 알아보실 수 있습니다. 공간과 서비스의 특징을 차근차근 살펴보세요. '.repeat(5);
  const paragraphs = formatMobileParagraphs(body);
  const content = { title: '모바일 읽기 테스트', paragraphs };
  const editor = new NaverEditorAdapter(page);
  await editor.enterAndVerify(content);
  const nodes = await page.locator('.se-section-text p').allTextContents();
  assert.equal(nodes.filter(text => text.trim()).length, paragraphs.length);
  assert.ok(nodes.some(text => !text.trim()), 'Rich editor contains actual blank paragraphs between text blocks');
  const positions = planInlineImages(paragraphs, imagePaths.length);
  const attached = await new NaverImageAdapter(page).attachAtParagraphs(imagePaths, paragraphs, positions);
  assert.equal(attached.insertedCount, 3);
  await editor.verifyCurrent(content);
  const finalText = await page.locator('.se-section-text p').last().textContent();
  assert.equal(finalText?.trim(), paragraphs.at(-1));
  await page.screenshot({ path: join(directory, 'layout-desktop.png'), fullPage: true });
  await page.setViewportSize({ width: 375, height: 812 });
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  await page.screenshot({ path: join(directory, 'layout-mobile.png'), fullPage: true });
  console.log('PASS: real rich-editor paragraph events; three images between text blocks; original text unchanged.');
  const saved = await new NaverDraftSaveAdapter(page).saveAndVerify();
  assert.equal(saved.stage, 'DRAFT_SAVE_COMPLETED');
  assert.equal(await page.evaluate(() => (window as any).saveClicks), 1);
  assert.equal(await page.evaluate(() => (window as any).publishClicks), 0);
  console.log('PASS: delayed save completion after 2.1 seconds; no publishing or repeated save clicks.');

  await page.evaluate(() => (window as any).mode = 'quiet');
  await assert.rejects(new NaverDraftSaveAdapter(page).saveAndVerify(), { code: 'DRAFT_SAVE_UNCONFIRMED' });
  assert.equal(await page.evaluate(() => (window as any).saveClicks), 2);
  console.log('PASS: stale completion message and click alone do not count as a fresh saved draft.');

  await page.setContent(html);
  await editor.enterAndVerify({ title: '위치 오류 테스트', paragraphs: ['첫 번째 설명입니다.', '두 번째 설명입니다.', '마지막 설명입니다.'] });
  await page.evaluate(() => (window as any).misplace = true);
  await assert.rejects(new NaverImageAdapter(page).attachAtParagraphs([imagePaths[0]!], ['첫 번째 설명입니다.', '두 번째 설명입니다.', '마지막 설명입니다.'], [1]), { code: 'IMAGE_POSITION_MISMATCH' });
  assert.equal(await page.evaluate(() => (window as any).saveClicks), 0);
  console.log('PASS: image incorrectly appended at end is detected before saving.');
  console.log('Screenshots: ' + directory);
} finally { await browser.close(); }

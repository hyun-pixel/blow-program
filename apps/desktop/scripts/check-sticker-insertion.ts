import assert from 'node:assert/strict';
import { chromium, type Page } from 'playwright-core';
import { NaverStickerAdapter } from '../../../packages/naver-adapter/src/naver-sticker.js';

// Isolated, developer-owned DOM. No Naver, account, paid AI, draft save or publication.
const paragraphs = Array.from({ length: 10 }, (_, index) => `${index + 1}번째 안내 문단입니다.`);
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const page = await browser.newPage();
const pageErrors: string[] = [];
page.on('pageerror', error => pageErrors.push(error.message));
await page.route('**/*', route => route.abort());

async function fixture(mode: string): Promise<NaverStickerAdapter> {
  await page.setContent(`<!doctype html><html lang="ko"><meta charset="utf-8">
    <button id="toolbar">스티커</button>
    <aside class="se-sidebar-container-sticker" hidden>
      <div class="se-panel-tab-list"><button class="se-tab-button se-is-selected" data-log="lsk.stklist">test_pack</button></div>
      <div class="se-sidebar-list se-is-on"><button class="se-sidebar-element-sticker">test_pack-1</button></div>
    </aside>
    <main>${paragraphs.map(text => `<div class="se-component se-text"><p class="se-text-paragraph" contenteditable="true">${text}</p></div>`).join('')}</main>
    </html>`);
  await page.evaluate((mode) => {
    const state = { clicks: 0, anchor: null as HTMLElement | null, before: false, mode };
    (window as any).stickerFixture = state;
    document.querySelector('#toolbar')!.addEventListener('click', () => {
      document.querySelector('aside')!.hidden = false;
    });
    document.addEventListener('selectionchange', () => {
      const selection = getSelection();
      const anchor = selection?.anchorNode?.parentElement?.closest<HTMLElement>('p');
      if (anchor) { state.anchor = anchor; state.before = selection!.anchorOffset === 0; }
    });
    document.querySelector('.se-sidebar-element-sticker')!.addEventListener('click', () => {
      state.clicks++;
      if (state.mode === 'missing') return;
      const anchor = state.anchor!.closest('.se-component')!;
      const sticker = document.createElement('div');
      sticker.className = 'se-component se-sticker';
      sticker.textContent = '삽입 스티커 ' + state.clicks;
      sticker.id = 'sticker-' + state.clicks;
      if (state.mode === 'wrong-position') {
        state.before ? anchor.after(sticker) : anchor.before(sticker);
      } else { state.before ? anchor.before(sticker) : anchor.after(sticker); }
      if (state.mode === 'duplicate') sticker.after(sticker.cloneNode(true));
      if (state.mode === 'hidden-previous' && state.clicks === 5) {
        // Layout visibility changes without removing existing editor components.
        (document.querySelector('#sticker-1') as HTMLElement).style.display = 'none';
      }
      if (state.mode === 'hidden-new') sticker.style.display = 'none';
      if (state.mode === 'broken-image') {
        const image = document.createElement('img');
        image.src = 'data:image/png;base64,broken';
        sticker.append(image);
      }
      if (state.mode === 'rerender-previous' && state.clicks === 5) {
        document.querySelectorAll('.se-sticker').forEach(previous => {
          if (previous !== sticker) previous.replaceWith(previous.cloneNode(true));
        });
      }
      if (state.mode === 'slow-fifth' && state.clicks === 5) {
        sticker.style.display = 'none';
        setTimeout(() => { sticker.style.display = ''; }, 6_000);
      }
    });
  }, mode);
  return new NaverStickerAdapter(page, () => 0);
}

async function clicks(target: Page): Promise<number> {
  return target.evaluate(() => (window as any).stickerFixture.clicks);
}

try {
  for (const mode of ['hidden-previous', 'slow-fifth', 'rerender-previous', 'normal']) {
    const adapter = await fixture(mode);
    const categories = await adapter.listStickerCategories(paragraphs, 1, 'after');
    const count = mode === 'normal' ? 10 : 6;
    for (let index = 1; index <= count; index++) {
      const result = await adapter.insertRandomSticker(paragraphs, index, 'after', categories.categories[0]!.id);
      assert.equal(result.stickerCount, index);
    }
    assert.equal(await clicks(page), count, 'Never click twice to compensate for delayed confirmation');
    assert.equal(await page.locator('.se-component.se-sticker').count(), count);
    assert.deepEqual(await page.locator('p').allTextContents(), paragraphs);
    console.log(`PASS ${mode}: ${count} stickers; ${count} clicks; original paragraphs unchanged.`);
  }
  for (const mode of ['missing', 'duplicate', 'hidden-new', 'broken-image', 'wrong-position']) {
    const adapter = await fixture(mode);
    await assert.rejects(adapter.insertDefaultSticker(paragraphs, 2, 'after'), {
      code: mode === 'wrong-position' ? 'STICKER_POSITION_MISMATCH' : 'STICKER_INSERT_UNCONFIRMED',
    });
    assert.equal(await clicks(page), 1);
    console.log(`PASS ${mode}: safely rejected after exactly one click.`);
  }
  assert.deepEqual(pageErrors, []);
} finally { await browser.close(); }

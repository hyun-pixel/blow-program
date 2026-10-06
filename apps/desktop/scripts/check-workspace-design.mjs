// Uses the isolated, mocked UI fixture on :4180. No credentials or paid requests.
// node apps/desktop/scripts/check-workspace-design.mjs
import { chromium } from 'playwright-core';
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';

const browser = await chromium.launch({ channel: 'chrome', headless: true });
const output = '.local/workspace-design';
await mkdir(output, { recursive: true });
const results = [];
const errors = [];
const widths = [1920, 1440, 1366, 1280, 1181, 1077, 1024, 760, 375];
try {
  const page = await browser.newPage({ reducedMotion: 'reduce' });
  page.setDefaultTimeout(10000);
  page.on('pageerror', error => errors.push(error.message));
  await page.route('**/*', route => {
    const url = new URL(route.request().url());
    if (url.hostname === '127.0.0.1' || ['data:', 'blob:'].includes(url.protocol)) return route.continue();
    errors.push(`Unexpected external request: ${url.origin}`);
    return route.abort();
  });
  const nav = label => page.locator('.sidebar').getByRole('button', { name: label, exact: true });
  const fits = async name => {
    const overflow = await page.evaluate(() => {
      const root = document.documentElement;
      return { width: innerWidth, scrollWidth: root.scrollWidth };
    });
    assert.ok(overflow.scrollWidth <= overflow.width + 1, `${name}: ${JSON.stringify(overflow)}`);
    results.push(name);
  };
  const start = async state => {
    await page.goto(`http://127.0.0.1:4180/preview.html?state=${state}`);
    await page.locator('#brand-brandName').waitFor();
    await page.waitForFunction(() => !document.getElementById('brand-brandName').disabled);
    await page.evaluate(() => document.fonts.ready);
    await page.locator('.titlebar').click({ position: { x: 16, y: 16 } });
  };

  const checkProfileColumns = async name => {
    const layout = await page.evaluate(() => {
      const form = document.querySelector('.brand-profile-form');
      const style = getComputedStyle(form);
      const available = form.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
      const bounds = selector => [...document.querySelectorAll(selector)].map(el => {
        const rect = el.closest('.field-group').getBoundingClientRect();
        const control = el.getBoundingClientRect();
        return { x: rect.x, y: rect.y, width: rect.width, bottom: rect.bottom,
          controlWidth: control.width, controlHeight: control.height };
      });
      return {
        columns: available >= 35 * parseFloat(style.fontSize) ? 2 : 1,
        required: bounds('#brand-profile-form input, #brand-profile-form textarea'),
        optional: bounds('.brand-optional-sections input, .brand-optional-sections textarea'),
      };
    });
    assert.equal(layout.required.length, 10);
    assert.equal(layout.optional.length, 5);
    const firstControl = layout.required[0];
    for (const field of [...layout.required, ...layout.optional]) {
      assert.ok(Math.abs(field.controlHeight - firstControl.controlHeight) < 1, `${name}: all input heights must match`);
      assert.ok(Math.abs(field.controlWidth - firstControl.controlWidth) < 1, `${name}: all input widths must match`);
    }
    for (const fields of [layout.required, layout.optional]) {
      for (let i = 0; i < fields.length; i++) {
        const field = fields[i];
        assert.ok(field.width > 0);
        if (layout.columns === 2 && i % 2 === 1) {
          const previous = fields[i - 1];
          assert.ok(Math.abs(field.y - previous.y) < 1, `${name}: pair must share a row`);
          assert.ok(field.x >= previous.x + previous.width, `${name}: columns must not overlap`);
          assert.ok(Math.abs(field.width - previous.width) < 1, `${name}: columns must be equal`);
        } else if (i > 0) {
          assert.ok(field.y >= fields[i - 1].bottom, `${name}: rows must not overlap`);
          assert.ok(Math.abs(field.x - fields[0].x) < 1, `${name}: row starts must align`);
        }
      }
    }
    results.push(`profile-${layout.columns}-column-${name}`);
    results.push(`profile-equal-control-sizes-${name}`);
  };

  const checkComposeColumns = async name => {
    const layout = await page.locator('.compose-fields').evaluate(form => {
      const bounds = el => {
        const { x, y, width, bottom } = el.getBoundingClientRect();
        return { x, y, width, bottom };
      };
      return {
        width: form.clientWidth,
        columns: form.clientWidth >= 52 * parseFloat(getComputedStyle(document.documentElement).fontSize) ? 2 : 1,
        sections: [...form.querySelectorAll(':scope > .compose-section')].map(bounds),
        fullWidth: [...form.querySelectorAll(':scope > .summary-disclosure, :scope > .compose-footer, :scope > button')].map(bounds),
      };
    });
    assert.equal(layout.sections.length, 10);
    const [topic, ...settings] = layout.sections;
    for (const block of [topic, ...layout.fullWidth]) {
      assert.ok(Math.abs(block.width - layout.width) < 1, `${name}: topic and form actions must span the whole row`);
      assert.ok(Math.abs(block.x - topic.x) < 1, `${name}: full-width blocks must align`);
    }
    for (let i = 0; i < settings.length; i++) {
      const current = settings[i];
      assert.ok(current.y >= topic.bottom, `${name}: settings must follow the topic`);
      assert.ok(Math.abs(current.width - settings[0].width) < 1, `${name}: settings must have equal widths`);
      if (layout.columns === 2 && i % 2 === 1) {
        const previous = settings[i - 1];
        assert.ok(Math.abs(current.y - previous.y) < 1, `${name}: settings must share a row`);
        assert.ok(current.x >= previous.x + previous.width, `${name}: columns must not overlap`);
      } else {
        assert.ok(Math.abs(current.x - topic.x) < 1, `${name}: rows must start at the left`);
        if (i > 0) {
          for (const previous of settings.slice(Math.max(0, i - layout.columns), i)) {
            assert.ok(current.y >= previous.bottom, `${name}: rows must not overlap`);
          }
        }
      }
    }
    results.push(`composer-${layout.columns}-column-${name}`);
  };

  const checkTextOrigin = async name => {
    const controls = await page.locator('.app .field-group input, .app .field-group textarea').evaluateAll(elements =>
      elements.filter(el => el.checkVisibility() && (el.tagName === 'TEXTAREA' ||
        ['text', 'tel', 'url', 'email', 'password', 'search', 'number'].includes(el.type))).map(el => {
        const style = getComputedStyle(el);
        const number = key => parseFloat(style[key]);
        return {
          id: el.id, multiline: el.tagName === 'TEXTAREA', align: style.textAlign,
          top: number('paddingTop'), left: number('paddingLeft'), line: number('lineHeight'),
          contentHeight: el.getBoundingClientRect().height - number('paddingTop') - number('paddingBottom') -
            number('borderTopWidth') - number('borderBottomWidth'),
        };
      }));
    assert.ok(controls.length > 0);
    for (const control of controls) {
      assert.equal(control.align, 'left', `${name}: ${control.id} must start at the left`);
      assert.equal(control.top, 11, `${name}: ${control.id} top inset`);
      assert.equal(control.left, 12, `${name}: ${control.id} left inset`);
      if (!control.multiline) assert.ok(Math.abs(control.contentHeight - control.line) < 1,
        `${name}: ${control.id} must not vertically center within extra space`);
    }
    results.push(`top-left-text-${name}`);
  };

  for (const width of widths) {
    await page.setViewportSize({ width, height: 960 });
    await start('ready');
    await fits(`settings-${width}`);
    await checkProfileColumns(String(width));
    await checkTextOrigin(`settings-${width}`);
    assert.equal(await page.locator('.titlebar').innerText(), '');
    assert.equal(await page.getByRole('button', { name: 'BLOW 블로그 세팅', exact: true }).isVisible(), true);
    results.push(`header-logo-only-${width}`);
    if (width === 1366 || width === 1077 || width === 375) {
      await page.locator('#brand-profile-form').screenshot({ path: `${output}/profile-fields-${width}.png` });
      await page.evaluate(() => scrollTo(0, 0));
    }
    assert.equal(await page.locator('.setup-shortcuts a').count(), 3);
    assert.notEqual(await page.locator('.sidebar').evaluate(el => getComputedStyle(el).boxShadow), 'none');
    assert.notEqual(await page.locator('#brand-brandName').evaluate(el => getComputedStyle(el).boxShadow), 'none');
    await page.screenshot({ path: `${output}/settings-${width}.png` });
    for (const target of ['brand-ai-heading', 'brand-naver-heading', 'brand-profile-heading']) {
      await page.locator(`.setup-shortcuts a[href="#${target}"]`).click();
      await page.waitForFunction(id => {
        const bounds = document.getElementById(id).getBoundingClientRect();
        return bounds.top >= 0 && bounds.top < innerHeight;
      }, target);
      assert.equal(await page.locator('#brand-brandName').inputValue(), '예시 브랜드');
      results.push(`shortcut-${target}-${width}`);
    }
    await nav('새 글 작성').click();
    assert.equal(await page.locator('#brand-brandName').isVisible(), false);
    await fits(`connection-required-${width}`);
    await page.screenshot({ path: `${output}/compose-gate-${width}.png` });
    await nav('블로그 세팅').click();
    await page.locator('#naver-blog-url').fill('https://blog.naver.com/example');
    await page.getByRole('button', { name: '전용 Chrome 열기', exact: true }).click();
    await page.getByRole('button', { name: '연결됐어요, 새 글 작성', exact: true }).click();
    await page.locator('#new-post-topic').fill('우리 브랜드를 처음 만나는 고객에게 전할 이야기');
    await page.locator('#new-post-article-type').selectOption('정보형');
    await page.locator('#new-post-model option[value="gpt-5.6-terra"]').waitFor({ state: 'attached' });
    await page.locator('#new-post-topic').scrollIntoViewIfNeeded();
    await fits(`composer-${width}`);
    await checkComposeColumns(String(width));
    await checkTextOrigin(`composer-${width}`);
    await page.screenshot({ path: `${output}/composer-${width}.png` });
    await page.locator('#new-post-article-type').focus();
    await page.keyboard.press('Tab');
    assert.equal(await page.evaluate(() => document.activeElement.id), 'new-post-target-length');
    await page.keyboard.press('Tab');
    assert.equal(await page.evaluate(() => document.activeElement.id), 'new-post-keyword-0');
    await page.locator('#new-post-service').selectOption('__custom__');
    await page.locator('#new-post-custom-service').fill('직접 입력한 상품 이름 '.repeat(10));
    await page.getByRole('button', { name: '보조 키워드 추가', exact: true }).click();
    await page.locator('#new-post-keyword-1').fill('긴 보조 키워드 테스트');
    await page.getByRole('radio', { name: 'AI 이미지 사용', exact: false }).check();
    for (const kind of ['quote', 'sticker', 'divider']) {
      await page.locator(`#compose-${kind}-enabled`).selectOption('yes');
    }
    await fits(`composer-expanded-${width}`);
    await checkComposeColumns(`expanded-${width}`);
    assert.equal(await page.locator('#new-post-topic').inputValue(), '우리 브랜드를 처음 만나는 고객에게 전할 이야기');
    if (width === 1366 || width === 375) {
      await page.locator('[aria-labelledby="compose-section-02"]').scrollIntoViewIfNeeded();
      await page.screenshot({ path: `${output}/composer-paired-${width}.png` });
    }
    if (width === 1366) {
      await page.evaluate(() => document.documentElement.style.fontSize = '200%');
      await checkComposeColumns('text-200');
      await fits('composer-text-200');
      await page.evaluate(() => document.documentElement.style.fontSize = '');
    }
    for (const [label, name] of [['작업 내역', 'history'], ['사용 가이드', 'guide']]) {
      await nav(label).click();
      await page.evaluate(() => scrollTo(0, 0));
      await fits(`${name}-${width}`);
      await page.screenshot({ path: `${output}/${name}-${width}.png` });
    }
    assert.deepEqual(await page.evaluate(() => window.__previewCalls), [], 'Design navigation must not generate or save content');
  }

  await page.setViewportSize({ width: 640, height: 700 });
  await start('new');
  await page.evaluate(() => document.documentElement.style.fontSize = '200%');
  await fits('settings-text-200');
  await checkProfileColumns('text-200');
  await checkTextOrigin('settings-text-200');
  await page.screenshot({ path: `${output}/settings-text-200.png` });
  await page.evaluate(() => document.documentElement.style.fontSize = '');

  await page.setViewportSize({ width: 1440, height: 960 });
  await start('error');
  await page.getByRole('alert').first().waitFor();
  await fits('settings-error');
  await page.screenshot({ path: `${output}/settings-error.png` });
  await start('ready');
  await page.keyboard.press('Tab');
  await page.locator('.setup-shortcuts a').first().focus();
  assert.equal(await page.locator('.setup-shortcuts a').first().evaluate(el => el.matches(':focus-visible') && getComputedStyle(el).outlineStyle !== 'none'), true);
  await page.keyboard.press('Enter');
  assert.match(page.url(), /#brand-profile-heading$/);
  results.push('keyboard-shortcuts');

  const requiredInputs = page.locator('#brand-profile-form input, #brand-profile-form textarea');
  const inputIds = await requiredInputs.evaluateAll(inputs => inputs.map(input => input.id));
  await requiredInputs.first().focus();
  for (const id of inputIds.slice(1)) {
    await page.keyboard.press('Tab');
    assert.equal(await page.evaluate(() => document.activeElement.id), id);
  }
  await page.getByRole('button', { name: '블로그 세팅 저장', exact: true }).click();
  await page.locator('#brand-defaultTone-error').waitFor();
  assert.equal(await page.evaluate(() => document.activeElement.id), 'brand-defaultTone');
  await checkProfileColumns('validation-errors');
  const values = {};
  for (const id of inputIds) {
    values[id.slice('brand-'.length)] = id === 'brand-brandIntroduction' ? '긴 소개 내용 '.repeat(100) : '레이아웃 확인';
    await page.locator(`#${id}`).fill(values[id.slice('brand-'.length)]);
  }
  await page.locator('#brand-activityRegion').fill('서울');
  await page.locator('#brand-defaultCta').fill('상담으로 확인해 주세요.');
  await page.getByRole('button', { name: '블로그 세팅 저장', exact: true }).click();
  await page.getByRole('heading', { name: '블로그 세팅 저장 완료', exact: true }).waitFor();
  const saved = await page.evaluate(async () => (await window.blowBrandProfile.get('preview-user')).profile);
  for (const [key, value] of Object.entries(values)) assert.equal(saved[key], value);
  assert.equal(saved.activityRegion, '서울');
  assert.equal(saved.defaultCta, '상담으로 확인해 주세요.');
  await fits('saved-long-content');
  await checkProfileColumns('saved-long-content');
  await checkTextOrigin('saved-long-content');
  const longText = await page.locator('#brand-brandIntroduction').evaluate(el => ({
    clientHeight: el.clientHeight, scrollHeight: el.scrollHeight, overflowY: getComputedStyle(el).overflowY,
  }));
  assert.ok(longText.scrollHeight > longText.clientHeight);
  assert.ok(['auto', 'scroll'].includes(longText.overflowY), 'Long text must remain scrollable');
  results.push('profile-keyboard-validation-and-mock-save');
  assert.deepEqual(errors, []);
  await writeFile(`${output}/results.json`, JSON.stringify({ results, errors }, null, 2));
  console.log(`PASS ${results.length} checks: ${widths.length} sizes, responsive profile and composer columns, full-width topic, expanded settings, setting anchors, preserved input, history, guide, error, 200% text, keyboard, validation, mock save. External traffic blocked.`);
} finally {
  await browser.close();
}

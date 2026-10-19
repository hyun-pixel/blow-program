import type {
  Locator,
  Page,
} from 'playwright-core';
import type { DraftContent } from './contracts.js';

const TITLE_MAX_LENGTH = 100;
const BODY_MAX_LENGTH = 10_000;
const PARAGRAPH_MAX_COUNT = 100;
const FIELD_SETTLE_DELAY_MS = 120;
const VERIFY_TIMEOUT_MS = 3_000;
const VERIFY_INTERVAL_MS = 100;

const titleSelectors = [
  '.se-section-documentTitle',
  '.se-component.se-documentTitle .se-title-text',
  '.se-title-text',
  '.se-section-documentTitle [contenteditable]',
  '.se-component.se-documentTitle [contenteditable]',
  '[class*="documentTitle"] [contenteditable]',
  '[class*="document-title"] [contenteditable]',
  '[contenteditable][aria-label*="제목"]',
  '[contenteditable][data-placeholder*="제목"]',
] as const;

const bodySelectors = [
  '.se-component.se-text .se-section-text',
  '.se-section-text',
  '.se-component.se-text .se-module-text',
  '.se-section-text [contenteditable]',
  '.se-component.se-text [contenteditable]',
  '[class*="section-text"] [contenteditable]',
  '[class*="component-text"] [contenteditable]',
  '[contenteditable][aria-label*="본문"]',
  '[contenteditable][data-placeholder*="본문"]',
] as const;

export type NaverEditorFailureCode =
  | 'INVALID_DRAFT_CONTENT'
  | 'EDITOR_NOT_READY'
  | 'EDITOR_FIELD_AMBIGUOUS'
  | 'EDITOR_NOT_BLANK'
  | 'EDITOR_INPUT_INTERRUPTED'
  | 'EDITOR_INPUT_MISMATCH';

export interface NaverEditorInputResult {
  readonly stage: 'CONTENT_VERIFIED';
  readonly message: string;
  readonly currentUrl: string;
  readonly titleLength: number;
  readonly bodyLength: number;
  readonly paragraphCount: number;
}

export interface NaverEditorStructureProbeResult {
  readonly missingTargetBlocked: boolean;
  readonly ambiguousTargetBlocked: boolean;
  readonly automatedActionCount: 0;
}

export class NaverEditorError extends Error {
  constructor(
    readonly code: NaverEditorFailureCode,
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = 'NaverEditorError';
  }
}

function throwIfInputInterrupted(signal?: AbortSignal): void {
  if (signal?.aborted) {
    throw new NaverEditorError(
      'EDITOR_INPUT_INTERRUPTED',
      '사용자 조작을 감지해 제목과 본문 입력을 중단했습니다.',
    );
  }
}

interface EditorFields {
  readonly title: Locator;
  readonly body: Locator;
}

interface CurrentEditorFields {
  readonly title: Locator;
  readonly bodies: readonly Locator[];
}

function normalizeLineEndings(value: string): string {
  return value
    .replace(/\r\n?/g, '\n')
    .replace(/\u00a0/g, ' ')
    .replace(/[\u200b\ufeff]/g, '');
}

export function normalizeEditorTitle(value: string): string {
  return normalizeLineEndings(value).replace(/\n+/g, ' ').trim();
}

export function normalizeEditorParagraphs(value: string): readonly string[] {
  return normalizeLineEndings(value)
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

export function validateDraftContent(input: DraftContent): DraftContent {
  const title = normalizeEditorTitle(input.title);
  const paragraphs = input.paragraphs
    .map((paragraph) => normalizeEditorTitle(paragraph))
    .filter((paragraph) => paragraph.length > 0);
  const bodyLength = paragraphs.join('\n\n').length;

  if (!title) {
    throw new NaverEditorError(
      'INVALID_DRAFT_CONTENT',
      '테스트할 제목을 입력해 주세요.',
    );
  }

  if (title.length > TITLE_MAX_LENGTH) {
    throw new NaverEditorError(
      'INVALID_DRAFT_CONTENT',
      `제목은 ${TITLE_MAX_LENGTH}자 이하로 입력해 주세요.`,
    );
  }

  if (paragraphs.length === 0) {
    throw new NaverEditorError(
      'INVALID_DRAFT_CONTENT',
      '테스트할 본문을 입력해 주세요.',
    );
  }

  if (paragraphs.length > PARAGRAPH_MAX_COUNT) {
    throw new NaverEditorError(
      'INVALID_DRAFT_CONTENT',
      `본문 문단은 ${PARAGRAPH_MAX_COUNT}개 이하로 입력해 주세요.`,
    );
  }

  if (bodyLength > BODY_MAX_LENGTH) {
    throw new NaverEditorError(
      'INVALID_DRAFT_CONTENT',
      `본문은 ${BODY_MAX_LENGTH.toLocaleString('ko-KR')}자 이하로 입력해 주세요.`,
    );
  }

  return { title, paragraphs };
}

async function readEditableText(locator: Locator): Promise<string> {
  return locator.evaluate((element) => {
    const clone = element.cloneNode(true) as HTMLElement;

    clone
      .querySelectorAll(
        '.se-placeholder, .__se_placeholder, [data-placeholder][aria-hidden="true"]',
      )
      .forEach((placeholder) => placeholder.remove());

    const paragraphNodes = clone.querySelectorAll('.se-text-paragraph, p');

    if (paragraphNodes.length > 0) {
      return Array.from(paragraphNodes)
        .map((paragraph) => paragraph.textContent || '')
        .join('\n');
    }

    clone.querySelectorAll('br').forEach((lineBreak) => {
      lineBreak.replaceWith('\n');
    });

    return clone.innerText || clone.textContent || '';
  });
}

async function findUniqueEditable(
  page: Page,
  fieldName: '제목' | '본문',
  selectors: readonly string[],
): Promise<Locator | null> {
  for (const selector of selectors) {
    const candidates: Locator[] = [];

    for (const frame of page.frames()) {
      const matches = frame.locator(selector);
      const count = await matches.count();

      for (let index = 0; index < count; index += 1) {
        const candidate = matches.nth(index);
        const visible = await candidate.isVisible().catch(() => false);

        if (visible) {
          candidates.push(candidate);
        }
      }
    }

    if (candidates.length > 1) {
      throw new NaverEditorError(
        'EDITOR_FIELD_AMBIGUOUS',
        `${fieldName} 입력 영역이 여러 개 보여 안전을 위해 작업을 멈췄습니다.`,
      );
    }

    if (candidates.length === 1) {
      return candidates[0]!;
    }
  }

  return null;
}

export async function probeNaverEditorStructureSafety(
  page: Page,
): Promise<NaverEditorStructureProbeResult> {
  const missingTarget = await findUniqueEditable(
    page,
    '제목',
    ['[data-blow-structure-safety-probe="missing"]'],
  );
  let ambiguousTargetBlocked = false;

  try {
    await findUniqueEditable(page, '제목', ['html, body']);
  } catch (error) {
    if (
      error instanceof NaverEditorError &&
      error.code === 'EDITOR_FIELD_AMBIGUOUS'
    ) {
      ambiguousTargetBlocked = true;
    } else {
      throw error;
    }
  }

  return {
    missingTargetBlocked: missingTarget === null,
    ambiguousTargetBlocked,
    automatedActionCount: 0,
  };
}

async function findVisibleEditables(
  page: Page,
  selectors: readonly string[],
): Promise<readonly Locator[]> {
  for (const selector of selectors) {
    const candidates: Locator[] = [];

    for (const frame of page.frames()) {
      const matches = frame.locator(selector);
      const count = await matches.count();

      for (let index = 0; index < count; index += 1) {
        const candidate = matches.nth(index);

        if (await candidate.isVisible().catch(() => false)) {
          candidates.push(candidate);
        }
      }
    }

    if (candidates.length > 0) {
      return candidates;
    }
  }

  return [];
}

async function findEditorFields(page: Page): Promise<EditorFields | null> {
  const title = await findUniqueEditable(page, '제목', titleSelectors);
  const body = await findUniqueEditable(page, '본문', bodySelectors);

  return title && body ? { title, body } : null;
}

async function waitForEditorFields(
  page: Page,
  signal?: AbortSignal,
  timeoutMs = 15_000,
): Promise<EditorFields> {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    throwIfInputInterrupted(signal);
    const fields = await findEditorFields(page);
    throwIfInputInterrupted(signal);

    if (fields) {
      return fields;
    }

    await page.waitForTimeout(300);
  }

  throwIfInputInterrupted(signal);
  throw new NaverEditorError(
    'EDITOR_NOT_READY',
    '네이버 편집기의 제목과 본문 입력 영역을 확인하지 못했습니다. 글쓰기 화면을 확인해 주세요.',
  );
}

async function waitForCurrentEditorFields(
  page: Page,
  timeoutMs = 15_000,
): Promise<CurrentEditorFields> {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    const [title, bodies] = await Promise.all([
      findUniqueEditable(page, '제목', titleSelectors),
      findVisibleEditables(page, bodySelectors),
    ]);

    if (title && bodies.length > 0) {
      return { title, bodies };
    }

    await page.waitForTimeout(300);
  }

  throw new NaverEditorError(
    'EDITOR_NOT_READY',
    '네이버 편집기의 현재 제목과 본문을 확인하지 못했습니다.',
  );
}

async function requireBlankDraft(fields: EditorFields): Promise<void> {
  const [title, body] = await Promise.all([
    readEditableText(fields.title),
    readEditableText(fields.body),
  ]);

  if (
    normalizeEditorTitle(title) ||
    normalizeEditorParagraphs(body).length > 0
  ) {
    throw new NaverEditorError(
      'EDITOR_NOT_BLANK',
      '편집기에 기존 내용이 있습니다. 빈 새 글을 연 뒤 다시 시도해 주세요.',
    );
  }
}

async function insertText(
  page: Page,
  value: string,
  signal?: AbortSignal,
): Promise<void> {
  throwIfInputInterrupted(signal);
  // One native input transaction, not thousands of character/model-update races.
  // Keep Enter events below so the rich editor still owns its paragraph model.
  await page.keyboard.insertText(value);
  throwIfInputInterrupted(signal);
  await page.waitForTimeout(FIELD_SETTLE_DELAY_MS);
  throwIfInputInterrupted(signal);
}

async function enterTitle(
  page: Page,
  locator: Locator,
  title: string,
  signal?: AbortSignal,
): Promise<void> {
  throwIfInputInterrupted(signal);
  const isEditable = await locator.isEditable().catch(() => false);
  throwIfInputInterrupted(signal);

  if (isEditable) {
    await locator.fill(title);
    throwIfInputInterrupted(signal);
    return;
  }

  await locator.click();
  throwIfInputInterrupted(signal);
  await insertText(page, title, signal);
}

async function enterParagraphs(
  page: Page,
  fields: EditorFields,
  content: DraftContent,
  signal?: AbortSignal,
): Promise<void> {
  const locator = fields.body;
  const { paragraphs } = content;
  throwIfInputInterrupted(signal);
  const isEditable = await locator.isEditable().catch(() => false);
  throwIfInputInterrupted(signal);

  // Rich editors need real paragraph/Enter events; filling a contenteditable can flatten its model.
  const plainField = isEditable && await locator.evaluate(element => ['INPUT', 'TEXTAREA'].includes(element.tagName));
  if (plainField) {
    await locator.fill(paragraphs.join('\n\n'));
    throwIfInputInterrupted(signal);
    return;
  }

  await locator.click();
  throwIfInputInterrupted(signal);

  let repaired = false;
  for (let index = 0; index < paragraphs.length; index += 1) {
    await insertText(page, paragraphs[index]!, signal);
    const checkpoint = { title: content.title, paragraphs: paragraphs.slice(0, index + 1) };
    try {
      await verifyEnteredContent(page, fields, checkpoint, signal);
    } catch (error) {
      // Only repair our current paragraph in this initially blank draft, once
      // per post. Never regenerate AI content or overwrite a changed prefix.
      if (!(error instanceof NaverEditorError) || error.code !== 'EDITOR_INPUT_MISMATCH'
        || repaired || !await repairCurrentParagraph(page, fields, checkpoint, signal)) throw error;
      repaired = true;
      await verifyEnteredContent(page, fields, checkpoint, signal);
    }

    if (index < paragraphs.length - 1) {
      throwIfInputInterrupted(signal);
      await page.keyboard.press('Enter');
      await page.waitForTimeout(FIELD_SETTLE_DELAY_MS);
      throwIfInputInterrupted(signal);
      await page.keyboard.press('Enter');
      await page.waitForTimeout(FIELD_SETTLE_DELAY_MS);
      throwIfInputInterrupted(signal);
    }
  }
}

async function readNormalizedContent(
  fields: EditorFields,
): Promise<{
  readonly title: string;
  readonly body: string;
}> {
  const [actualTitle, actualBody] = await Promise.all([
    readEditableText(fields.title),
    readEditableText(fields.body),
  ]);

  return {
    title: normalizeEditorTitle(actualTitle),
    body: normalizeEditorParagraphs(actualBody).join('\n\n'),
  };
}

async function repairCurrentParagraph(
  page: Page,
  fields: EditorFields,
  expected: DraftContent,
  signal?: AbortSignal,
): Promise<boolean> {
  throwIfInputInterrupted(signal);
  const before = await readNormalizedContent(fields);
  if (before.title !== expected.title) return false;
  const nodes = fields.body.locator('.se-text-paragraph, p');
  const count = await nodes.count();
  if (!count) return false;
  const texts: string[] = [];
  for (let index = 0; index < count; index += 1) {
    const node = nodes.nth(index);
    if (!await node.isVisible()) return false;
    texts.push(normalizeEditorTitle(await readEditableText(node)));
  }
  const prefix = texts.slice(0, -1).filter(Boolean);
  const wanted = expected.paragraphs.at(-1)!;
  const actual = texts.at(-1)!;
  if (prefix.length !== expected.paragraphs.length - 1
    || prefix.some((text, index) => text !== expected.paragraphs[index])
    || before.body !== texts.filter(Boolean).join('\n\n')
    || actual === wanted) return false;
  // Missing characters only. Substitutions, foreign text and reordered content
  // remain failures; accepting a shorter string as a success is never allowed.
  let offset = 0;
  for (const character of actual) {
    const next = wanted.indexOf(character, offset);
    if (next < 0) return false;
    offset = next + character.length;
  }
  const target = nodes.nth(count - 1);
  throwIfInputInterrupted(signal);
  await target.selectText();
  throwIfInputInterrupted(signal);
  const selected = await target.evaluate(element => {
    const selection = element.ownerDocument.getSelection();
    if (!selection?.anchorNode || !selection.focusNode
      || !element.contains(selection.anchorNode) || !element.contains(selection.focusNode)) return null;
    return selection.toString();
  });
  const current = await readNormalizedContent(fields);
  throwIfInputInterrupted(signal);
  if (selected === null || normalizeEditorTitle(selected) !== actual
    || current.title !== before.title || current.body !== before.body) return false;
  await insertText(page, wanted, signal);
  return true;
}

async function verifyEnteredContent(
  page: Page,
  fields: EditorFields,
  expected: DraftContent,
  signal?: AbortSignal,
): Promise<void> {
  const expectedBody = expected.paragraphs.join('\n\n');
  const matchesExpected = (actual: { title: string; body: string }) =>
    actual.title === expected.title &&
    (actual.body === expectedBody ||
      actual.body.replace(/\n/g, '') === expectedBody.replace(/\n/g, ''));
  const deadline = Date.now() + VERIFY_TIMEOUT_MS;
  throwIfInputInterrupted(signal);
  let actual = await readNormalizedContent(fields);
  throwIfInputInterrupted(signal);

  let confirmed = false;
  while (Date.now() < deadline) {
    const matched = matchesExpected(actual);
    await page.waitForTimeout(VERIFY_INTERVAL_MS);
    throwIfInputInterrupted(signal);
    actual = await readNormalizedContent(fields);
    throwIfInputInterrupted(signal);
    if (matched && matchesExpected(actual)) { confirmed = true; break; }
  }

  if (!confirmed) {
    const actualParagraphs = normalizeEditorParagraphs(actual.body);
    const paragraph = expected.paragraphs.findIndex((text, index) => text !== actualParagraphs[index]);
    throw new NaverEditorError(
      'EDITOR_INPUT_MISMATCH',
      `네이버 편집기 입력이 원문과 다릅니다.${paragraph >= 0 ? ` ${paragraph + 1}번째 문단을 확인해 주세요.` : ''} 제목 ` +
        actual.title.length +
        '/' +
        expected.title.length +
        '자, 본문 ' +
        actual.body.length +
        '/' +
        expectedBody.length +
        '자입니다. 잘못된 내용이 저장되지 않도록 중단했습니다. [EDITOR_INPUT_MISMATCH]',
    );
  }
}

async function readNormalizedCurrentContent(
  fields: CurrentEditorFields,
): Promise<{
  readonly title: string;
  readonly body: string;
}> {
  const [actualTitle, bodyParts] = await Promise.all([
    readEditableText(fields.title),
    Promise.all(fields.bodies.map((body) => readEditableText(body))),
  ]);

  return {
    title: normalizeEditorTitle(actualTitle),
    body: bodyParts
      .flatMap((body) => normalizeEditorParagraphs(body))
      .join('\n\n'),
  };
}

async function verifyCurrentContent(
  page: Page,
  fields: CurrentEditorFields,
  expected: DraftContent,
): Promise<void> {
  const expectedBody = expected.paragraphs.join('\n\n');
  const matchesExpected = (actual: { title: string; body: string }) =>
    actual.title === expected.title &&
    (
      actual.body === expectedBody ||
      actual.body.replace(/\n/g, '') === expectedBody.replace(/\n/g, '')
    );
  const deadline = Date.now() + VERIFY_TIMEOUT_MS;
  let actual = await readNormalizedCurrentContent(fields);

  while (!matchesExpected(actual) && Date.now() < deadline) {
    await page.waitForTimeout(VERIFY_INTERVAL_MS);
    actual = await readNormalizedCurrentContent(fields);
  }

  if (!matchesExpected(actual)) {
    throw new NaverEditorError(
      'EDITOR_INPUT_MISMATCH',
      '네이버 편집기의 현재 제목 또는 본문이 입력 원문과 다릅니다.',
    );
  }
}

export class NaverEditorAdapter {
  constructor(private readonly page: Page) {}

  async verifyCurrent(input: DraftContent): Promise<void> {
    const content = validateDraftContent(input);

    try {
      const fields = await waitForCurrentEditorFields(this.page);
      await verifyCurrentContent(this.page, fields, content);
    } catch (error) {
      if (error instanceof NaverEditorError) {
        throw error;
      }

      throw new NaverEditorError(
        'EDITOR_NOT_READY',
        '네이버 편집기의 현재 제목과 본문을 확인하지 못했습니다.',
        { cause: error },
      );
    }
  }

  async enterAndVerify(
    input: DraftContent,
    signal?: AbortSignal,
  ): Promise<NaverEditorInputResult> {
    const content = validateDraftContent(input);

    try {
      throwIfInputInterrupted(signal);
      const fields = await waitForEditorFields(this.page, signal);
      await requireBlankDraft(fields);
      throwIfInputInterrupted(signal);
      await enterTitle(this.page, fields.title, content.title, signal);
      await this.page.waitForTimeout(FIELD_SETTLE_DELAY_MS);
      throwIfInputInterrupted(signal);
      await enterParagraphs(this.page, fields, content, signal);
      await this.page.waitForTimeout(FIELD_SETTLE_DELAY_MS);
      throwIfInputInterrupted(signal);
      await verifyEnteredContent(this.page, fields, content, signal);

      const body = content.paragraphs.join('\n\n');

      return {
        stage: 'CONTENT_VERIFIED',
        message: '제목과 본문을 입력하고 원문과 일치하는지 확인했습니다.',
        currentUrl: this.page.url(),
        titleLength: content.title.length,
        bodyLength: body.length,
        paragraphCount: content.paragraphs.length,
      };
    } catch (error) {
      if (error instanceof NaverEditorError) {
        throw error;
      }

      throw new NaverEditorError(
        'EDITOR_NOT_READY',
        '네이버 편집기를 조작할 수 없어 작업을 멈췄습니다. Chrome 화면을 확인해 주세요.',
        { cause: error },
      );
    }
  }
}

export async function requireMatchingBodyParagraphs(page: Page, expected: readonly string[]): Promise<readonly Locator[]> {
  const locators = await findVisibleEditables(page, ['.se-component.se-text .se-text-paragraph', '.se-section-text .se-text-paragraph', '.se-component.se-text p']);
  const normalize = (text: string): string => normalizeLineEndings(text).replace(/\s+/g, ' ').trim();
  const entries = await Promise.all(locators.map(async locator => ({ locator, text: normalize(await locator.innerText()) })));
  const paragraphs = entries.filter(entry => entry.text);
  if (!paragraphs.length || paragraphs.length !== expected.length || paragraphs.some((entry, index) => entry.text !== normalize(expected[index]!))) {
    throw new NaverEditorError('EDITOR_INPUT_MISMATCH', '이미지 위치의 기준이 되는 본문 문단이 원문과 다릅니다. 끝에 몰아서 넣지 않고 중단했습니다.');
  }
  return paragraphs.map(entry => entry.locator);
}

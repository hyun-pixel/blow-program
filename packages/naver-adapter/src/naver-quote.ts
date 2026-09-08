import type {
  Locator,
  Page,
} from 'playwright-core';
import { placeCaretAtParagraphEdge as setParagraphCaret } from './naver-editor-selection.js';

const QUOTE_VERIFY_TIMEOUT_MS = 5_000;
const QUOTE_VERIFY_INTERVAL_MS = 100;

const paragraphSelectors = [
  '.se-component.se-text .se-text-paragraph',
  '.se-section-text .se-text-paragraph',
  '.se-component.se-text p',
] as const;

const quoteComponentSelector = [
  '.se-component.se-quotation',
  '.se-component[class*="quotation"]',
  '.se-component[data-module*="quotation"]',
  '.se-component.se-quote',
].join(', ');

const quoteControlSelector = 'button, [role="button"]';

const quoteStyleOptionSelector = [
  '[class*="se-toolbar-option-insert-quotation-"][class*="-button"]',
  '[class*="se-insert-menu-sub-panel-button-quotation-"]',
].join(', ');

const quoteStyleOrder = [
  'default',
  'quotation_line',
  'quotation_bubble',
  'quotation_underline',
  'quotation_postit',
  'quotation_corner',
] as const;

export type NaverQuotePosition = 'before' | 'after';
export type NaverQuoteStyleId = (typeof quoteStyleOrder)[number];
export type NaverQuoteStyleSelection = NaverQuoteStyleId | 'random';

export type NaverQuoteFailureCode =
  | 'INVALID_QUOTE_REQUEST'
  | 'QUOTE_OPERATION_INTERRUPTED'
  | 'QUOTE_ANCHOR_NOT_FOUND'
  | 'QUOTE_ANCHOR_MISMATCH'
  | 'QUOTE_SELECTION_FAILED'
  | 'QUOTE_CONTROL_NOT_FOUND'
  | 'QUOTE_CONTROL_AMBIGUOUS'
  | 'QUOTE_STYLE_CONTROL_NOT_FOUND'
  | 'QUOTE_STYLE_CONTROL_AMBIGUOUS'
  | 'QUOTE_STYLE_NOT_FOUND'
  | 'QUOTE_STYLE_AMBIGUOUS'
  | 'QUOTE_STYLE_STALE'
  | 'QUOTE_STYLE_MISMATCH'
  | 'QUOTE_INSERT_UNCONFIRMED'
  | 'QUOTE_POSITION_MISMATCH';

export interface NaverQuoteStyle {
  readonly id: NaverQuoteStyleId;
  readonly label: string;
}

export interface NaverQuoteStyleResult {
  readonly stage: 'QUOTE_STYLES_READY';
  readonly message: string;
  readonly currentUrl: string;
  readonly paragraphNumber: number;
  readonly position: NaverQuotePosition;
  readonly styles: readonly NaverQuoteStyle[];
}

export interface NaverQuoteInsertionResult {
  readonly stage: 'QUOTE_VERIFIED';
  readonly message: string;
  readonly currentUrl: string;
  readonly paragraphNumber: number;
  readonly position: NaverQuotePosition;
  readonly quoteCount: number;
  readonly styleId?: NaverQuoteStyleId;
  readonly styleLabel?: string;
}

export class NaverQuoteError extends Error {
  constructor(
    readonly code: NaverQuoteFailureCode,
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = 'NaverQuoteError';
  }
}

function throwIfQuoteInterrupted(signal?: AbortSignal): void {
  if (signal?.aborted) {
    throw new NaverQuoteError(
      'QUOTE_OPERATION_INTERRUPTED',
      '사용자 조작을 감지해 남은 인용구 작업을 중단했습니다.',
    );
  }
}

interface QuotePositionCounts {
  readonly before: number;
  readonly after: number;
}

interface QuoteControlCandidate {
  readonly locator: Locator;
  readonly score: number;
}

interface QuoteStyleCandidate extends NaverQuoteStyle {
  readonly locator: Locator;
}

function normalizeParagraphText(value: string): string {
  return value
    .replace(/\r\n?/g, '\n')
    .replace(/\u00a0/g, ' ')
    .replace(/[\u200b\ufeff]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function validateQuoteStyleSelection(
  value: string,
): NaverQuoteStyleSelection {
  if (
    value === 'random' ||
    quoteStyleOrder.includes(value as NaverQuoteStyleId)
  ) {
    return value as NaverQuoteStyleSelection;
  }

  throw new NaverQuoteError(
    'INVALID_QUOTE_REQUEST',
    '사용할 인용구 디자인을 다시 선택해 주세요.',
  );
}

export function validateQuoteRequest(
  expectedParagraphs: readonly string[],
  paragraphNumber: number,
  position: NaverQuotePosition,
): {
  readonly expectedParagraphs: readonly string[];
  readonly paragraphNumber: number;
  readonly position: NaverQuotePosition;
} {
  const normalizedParagraphs = expectedParagraphs
    .map(normalizeParagraphText)
    .filter((paragraph) => paragraph.length > 0);

  if (
    normalizedParagraphs.length === 0 ||
    !Number.isInteger(paragraphNumber) ||
    paragraphNumber < 1 ||
    paragraphNumber > normalizedParagraphs.length ||
    (position !== 'before' && position !== 'after')
  ) {
    throw new NaverQuoteError(
      'INVALID_QUOTE_REQUEST',
      '인용구를 넣을 문단과 위치를 다시 선택해 주세요.',
    );
  }

  return {
    expectedParagraphs: normalizedParagraphs,
    paragraphNumber,
    position,
  };
}

async function findVisibleParagraphs(page: Page): Promise<readonly Locator[]> {
  for (const selector of paragraphSelectors) {
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

async function requireMatchingParagraphs(
  page: Page,
  expectedParagraphs: readonly string[],
): Promise<readonly Locator[]> {
  const paragraphs = await findVisibleParagraphs(page);

  if (paragraphs.length === 0) {
    throw new NaverQuoteError(
      'QUOTE_ANCHOR_NOT_FOUND',
      '인용구 위치의 기준이 되는 본문 문단을 확인하지 못했습니다.',
    );
  }

  const paragraphEntries = await Promise.all(
    paragraphs.map(async (paragraph) => ({
      locator: paragraph,
      text: normalizeParagraphText(
        await paragraph.innerText().catch(() => ''),
      ),
    })),
  );
  const contentParagraphs = paragraphEntries.filter(
    (paragraph) => paragraph.text.length > 0,
  );

  if (
    contentParagraphs.length !== expectedParagraphs.length ||
    contentParagraphs.some(
      (paragraph, index) => paragraph.text !== expectedParagraphs[index],
    )
  ) {
    throw new NaverQuoteError(
      'QUOTE_ANCHOR_MISMATCH',
      '네이버 본문 문단이 원문과 달라 인용구 위치를 안전하게 정할 수 없습니다.',
    );
  }

  return contentParagraphs.map((paragraph) => paragraph.locator);
}

async function findQuoteControls(page: Page): Promise<readonly Locator[]> {
  const candidates: QuoteControlCandidate[] = [];

  for (const frame of page.frames()) {
    const controls = frame.locator(quoteControlSelector);
    const count = await controls.count();

    for (let index = 0; index < count; index += 1) {
      const control = controls.nth(index);
      const [visible, snapshot] = await Promise.all([
        control.isVisible().catch(() => false),
        control.evaluate((element) => {
          const ariaLabel = element.getAttribute('aria-label') ?? '';
          const title = element.getAttribute('title') ?? '';
          const text = element.textContent ?? '';
          const identity = [
            element.id,
            element.className,
            element.getAttribute('data-name') ?? '',
            element.getAttribute('data-type') ?? '',
          ].join(' ');

          return {
            label: (ariaLabel || title || text).replace(/\s+/g, ' ').trim(),
            identity,
          };
        }).catch(() => ({ label: '', identity: '' })),
      ]);

      if (!visible) {
        continue;
      }

      const normalizedLabel = snapshot.label.replace(/\s+/g, ' ').trim();
      const isExactLabel =
        normalizedLabel === '인용구' || normalizedLabel === '인용구 삽입';
      const isSupportingControl = /(종류|디자인|스타일|선택|펼치기)/.test(
        normalizedLabel,
      );
      const isRelatedLabel =
        normalizedLabel.startsWith('인용구') && !isSupportingControl;
      const hasQuoteIdentity =
        !isSupportingControl &&
        /(quotation|quote)/i.test(snapshot.identity);
      const score = isExactLabel
        ? 3
        : isRelatedLabel
          ? 2
          : hasQuoteIdentity
            ? 1
            : 0;

      if (score > 0) {
        candidates.push({ locator: control, score });
      }
    }
  }

  const highestScore = Math.max(
    0,
    ...candidates.map((candidate) => candidate.score),
  );

  return candidates
    .filter((candidate) => candidate.score === highestScore)
    .map((candidate) => candidate.locator);
}

async function requireUniqueQuoteControl(page: Page): Promise<Locator> {
  const controls = await findQuoteControls(page);

  if (controls.length === 0) {
    throw new NaverQuoteError(
      'QUOTE_CONTROL_NOT_FOUND',
      '네이버 편집기의 인용구 버튼을 확인하지 못했습니다. Chrome 화면을 확인해 주세요.',
    );
  }

  if (controls.length > 1) {
    throw new NaverQuoteError(
      'QUOTE_CONTROL_AMBIGUOUS',
      '인용구 버튼이 여러 개 보여 안전을 위해 작업을 멈췄습니다.',
    );
  }

  return controls[0]!;
}

function getQuoteStyleLabel(styleId: NaverQuoteStyleId): string {
  return '인용구 ' + (quoteStyleOrder.indexOf(styleId) + 1);
}

async function findQuoteStyleMenuControls(
  page: Page,
): Promise<readonly Locator[]> {
  const candidates: QuoteControlCandidate[] = [];

  for (const frame of page.frames()) {
    const controls = frame.locator(quoteControlSelector);
    const count = await controls.count();

    for (let index = 0; index < count; index += 1) {
      const control = controls.nth(index);
      const [visible, snapshot] = await Promise.all([
        control.isVisible().catch(() => false),
        control.evaluate((element) => {
          const ariaLabel = element.getAttribute('aria-label') ?? '';
          const title = element.getAttribute('title') ?? '';
          const text = element.textContent ?? '';
          const identity = [
            element.id,
            element.className,
            element.getAttribute('data-name') ?? '',
            element.getAttribute('data-type') ?? '',
          ].join(' ');

          return {
            label: (ariaLabel || title || text).replace(/\s+/g, ' ').trim(),
            identity,
          };
        }).catch(() => ({ label: '', identity: '' })),
      ]);

      if (!visible) {
        continue;
      }

      const normalizedLabel = snapshot.label.replace(/\s+/g, ' ').trim();
      const isExactLabel = normalizedLabel === '인용구 선택';
      const isRelatedLabel =
        normalizedLabel.startsWith('인용구') &&
        /(종류|디자인|스타일|선택|펼치기)/.test(normalizedLabel);
      const hasStyleMenuIdentity =
        /(quotation|quote)/i.test(snapshot.identity) &&
        /(select|selector|toggle|dropdown|arrow)/i.test(snapshot.identity);
      const score = isExactLabel
        ? 3
        : isRelatedLabel
          ? 2
          : hasStyleMenuIdentity
            ? 1
            : 0;

      if (score > 0) {
        candidates.push({ locator: control, score });
      }
    }
  }

  const highestScore = Math.max(
    0,
    ...candidates.map((candidate) => candidate.score),
  );

  return candidates
    .filter((candidate) => candidate.score === highestScore)
    .map((candidate) => candidate.locator);
}

async function requireUniqueQuoteStyleMenuControl(
  page: Page,
): Promise<Locator> {
  const controls = await findQuoteStyleMenuControls(page);

  if (controls.length === 0) {
    throw new NaverQuoteError(
      'QUOTE_STYLE_CONTROL_NOT_FOUND',
      '네이버 편집기의 인용구 선택 버튼을 확인하지 못했습니다. Chrome 화면을 확인해 주세요.',
    );
  }

  if (controls.length > 1) {
    throw new NaverQuoteError(
      'QUOTE_STYLE_CONTROL_AMBIGUOUS',
      '인용구 선택 버튼이 여러 개 보여 안전을 위해 작업을 멈췄습니다.',
    );
  }

  return controls[0]!;
}

async function findVisibleQuoteStyles(
  page: Page,
): Promise<readonly QuoteStyleCandidate[]> {
  const candidates: QuoteStyleCandidate[] = [];

  for (const frame of page.frames()) {
    const options = frame.locator(quoteStyleOptionSelector);
    const count = await options.count();

    for (let index = 0; index < count; index += 1) {
      const option = options.nth(index);
      const [visible, snapshot] = await Promise.all([
        option.isVisible().catch(() => false),
        option.evaluate((element) => ({
          label: (
            element.getAttribute('aria-label') ||
            element.getAttribute('title') ||
            element.textContent ||
            ''
          ).replace(/\s+/g, ' ').trim(),
          identity: [
            element.id,
            element.className,
            element.getAttribute('data-name') ?? '',
            element.getAttribute('data-type') ?? '',
          ].join(' '),
        })).catch(() => ({ label: '', identity: '' })),
      ]);

      if (!visible) {
        continue;
      }

      const match = snapshot.identity.match(
        /(?:se-toolbar-option-insert-quotation-|se-insert-menu-sub-panel-button-quotation-)(default|quotation_(?:line|bubble|underline|postit|corner))(?:-button)?/i,
      );
      const styleId = match?.[1]?.toLowerCase() as
        | NaverQuoteStyleId
        | undefined;

      if (!styleId || !quoteStyleOrder.includes(styleId)) {
        continue;
      }

      candidates.push({
        id: styleId,
        label: /^인용구\s*\d+$/.test(snapshot.label)
          ? snapshot.label.replace(/인용구\s*(\d+)/, '인용구 $1')
          : getQuoteStyleLabel(styleId),
        locator: option,
      });
    }
  }

  const unique = new Map<NaverQuoteStyleId, QuoteStyleCandidate>();

  for (const candidate of candidates) {
    if (unique.has(candidate.id)) {
      throw new NaverQuoteError(
        'QUOTE_STYLE_AMBIGUOUS',
        '같은 인용구 디자인이 여러 곳에 보여 안전을 위해 작업을 멈췄습니다.',
      );
    }

    unique.set(candidate.id, candidate);
  }

  return quoteStyleOrder
    .map((styleId) => unique.get(styleId))
    .filter((candidate): candidate is QuoteStyleCandidate =>
      Boolean(candidate),
    );
}

async function waitForQuoteStyles(
  page: Page,
): Promise<readonly QuoteStyleCandidate[]> {
  const maxAttempts = Math.ceil(
    QUOTE_VERIFY_TIMEOUT_MS / QUOTE_VERIFY_INTERVAL_MS,
  );
  let previousSignature = '';
  let stableAttempts = 0;

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const styles = await findVisibleQuoteStyles(page);
    const signature = styles.map((style) => style.id).join('|');

    if (styles.length > 0 && signature === previousSignature) {
      stableAttempts += 1;
    } else {
      previousSignature = signature;
      stableAttempts = 0;
    }

    if (styles.length > 0 && stableAttempts >= 2) {
      return styles;
    }

    await page.waitForTimeout(QUOTE_VERIFY_INTERVAL_MS);
  }

  throw new NaverQuoteError(
    'QUOTE_STYLE_NOT_FOUND',
    '인용구 선택창은 열렸지만 디자인 목록을 확인하지 못했습니다. Chrome 화면을 확인해 주세요.',
  );
}

async function ensureQuoteStyles(
  page: Page,
): Promise<readonly QuoteStyleCandidate[]> {
  const visibleStyles = await findVisibleQuoteStyles(page);

  if (visibleStyles.length > 0) {
    return visibleStyles;
  }

  const control = await requireUniqueQuoteStyleMenuControl(page);

  try {
    await control.click();
  } catch (error) {
    throw new NaverQuoteError(
      'QUOTE_STYLE_NOT_FOUND',
      '네이버 편집기의 인용구 선택창을 열지 못했습니다. Chrome 화면을 확인해 주세요.',
      { cause: error },
    );
  }

  return waitForQuoteStyles(page);
}

async function getVisibleQuoteStyleCount(
  page: Page,
  styleId: NaverQuoteStyleId,
): Promise<number> {
  let total = 0;
  const layoutClass = 'se-l-' + styleId;

  for (const frame of page.frames()) {
    const components = frame.locator(quoteComponentSelector);
    const count = await components.count();

    for (let index = 0; index < count; index += 1) {
      const component = components.nth(index);

      if (!(await component.isVisible().catch(() => false))) {
        continue;
      }

      const hasStyle = await component.evaluate(
        (element, expectedClass) =>
          element.classList.contains(expectedClass) ||
          Boolean(element.querySelector('.' + expectedClass)),
        layoutClass,
      ).catch(() => false);

      if (hasStyle) {
        total += 1;
      }
    }
  }

  return total;
}

async function getVisibleQuoteCount(page: Page): Promise<number> {
  let total = 0;

  for (const frame of page.frames()) {
    const components = frame.locator(quoteComponentSelector);
    const count = await components.count();

    for (let index = 0; index < count; index += 1) {
      if (await components.nth(index).isVisible().catch(() => false)) {
        total += 1;
      }
    }
  }

  return total;
}

async function measureQuotePosition(
  anchor: Locator,
): Promise<QuotePositionCounts> {
  return anchor.evaluate((element, selector) => {
    const components = Array.from(
      element.ownerDocument.querySelectorAll(selector),
    );

    return components.reduce(
      (counts, component) => {
        const relation = element.compareDocumentPosition(component);

        if (relation & Node.DOCUMENT_POSITION_PRECEDING) {
          counts.before += 1;
        }

        if (relation & Node.DOCUMENT_POSITION_FOLLOWING) {
          counts.after += 1;
        }

        return counts;
      },
      { before: 0, after: 0 },
    );
  }, quoteComponentSelector);
}

async function placeCaretAtParagraphEdge(
  page: Page,
  anchor: Locator,
  position: NaverQuotePosition,
): Promise<void> {
  try {
    await setParagraphCaret(page, anchor, position);
  } catch (error) {
    throw new NaverQuoteError(
      'QUOTE_SELECTION_FAILED',
      '인용구를 넣을 본문 위치에 커서를 지정하지 못했습니다. 네이버 편집기에서 본문이 선택 가능한지 확인해 주세요.',
      { cause: error },
    );
  }
}

async function waitForQuoteCount(
  page: Page,
  expectedCount: number,
  signal?: AbortSignal,
): Promise<number> {
  const maxAttempts = Math.ceil(
    QUOTE_VERIFY_TIMEOUT_MS / QUOTE_VERIFY_INTERVAL_MS,
  );
  let actualCount = await getVisibleQuoteCount(page);

  for (
    let attempt = 0;
    actualCount !== expectedCount && attempt < maxAttempts;
    attempt += 1
  ) {
    throwIfQuoteInterrupted(signal);
    await page.waitForTimeout(QUOTE_VERIFY_INTERVAL_MS);
    throwIfQuoteInterrupted(signal);
    actualCount = await getVisibleQuoteCount(page);
  }

  return actualCount;
}

export class NaverQuoteAdapter {
  constructor(
    private readonly page: Page,
    private readonly random: () => number = Math.random,
  ) {}

  async listQuoteStyles(
    expectedParagraphs: readonly string[],
    paragraphNumber: number,
    position: NaverQuotePosition,
    signal?: AbortSignal,
  ): Promise<NaverQuoteStyleResult> {
    const request = validateQuoteRequest(
      expectedParagraphs,
      paragraphNumber,
      position,
    );

    try {
      throwIfQuoteInterrupted(signal);
      const paragraphs = await requireMatchingParagraphs(
        this.page,
        request.expectedParagraphs,
      );
      throwIfQuoteInterrupted(signal);
      const anchor = paragraphs[request.paragraphNumber - 1]!;

      await placeCaretAtParagraphEdge(this.page, anchor, request.position);
      throwIfQuoteInterrupted(signal);
      await this.page.waitForTimeout(QUOTE_VERIFY_INTERVAL_MS);
      throwIfQuoteInterrupted(signal);
      const styles = await ensureQuoteStyles(this.page);
      throwIfQuoteInterrupted(signal);

      return {
        stage: 'QUOTE_STYLES_READY',
        message: '전용 Chrome에 표시된 인용구 디자인을 불러왔습니다.',
        currentUrl: this.page.url(),
        paragraphNumber: request.paragraphNumber,
        position: request.position,
        styles: styles.map(({ id, label }) => ({ id, label })),
      };
    } catch (error) {
      if (error instanceof NaverQuoteError) {
        throw error;
      }

      throw new NaverQuoteError(
        'QUOTE_STYLE_NOT_FOUND',
        '인용구 디자인을 불러오지 못했습니다. Chrome 화면을 확인해 주세요.',
        { cause: error },
      );
    }
  }

  async insertQuote(
    expectedParagraphs: readonly string[],
    paragraphNumber: number,
    position: NaverQuotePosition,
    styleSelection?: NaverQuoteStyleSelection,
    signal?: AbortSignal,
  ): Promise<NaverQuoteInsertionResult> {
    const request = validateQuoteRequest(
      expectedParagraphs,
      paragraphNumber,
      position,
    );
    const validatedStyle = styleSelection === undefined
      ? undefined
      : validateQuoteStyleSelection(styleSelection);

    try {
      throwIfQuoteInterrupted(signal);
      const paragraphs = await requireMatchingParagraphs(
        this.page,
        request.expectedParagraphs,
      );
      throwIfQuoteInterrupted(signal);
      const anchor = paragraphs[request.paragraphNumber - 1]!;
      const beforeCount = await getVisibleQuoteCount(this.page);
      throwIfQuoteInterrupted(signal);
      const beforePosition = await measureQuotePosition(anchor);
      throwIfQuoteInterrupted(signal);

      await placeCaretAtParagraphEdge(this.page, anchor, request.position);
      throwIfQuoteInterrupted(signal);
      await this.page.waitForTimeout(QUOTE_VERIFY_INTERVAL_MS);
      throwIfQuoteInterrupted(signal);

      let selectedStyle: QuoteStyleCandidate | undefined;
      let beforeStyleCount = 0;

      if (validatedStyle === undefined) {
        const control = await requireUniqueQuoteControl(this.page);
        throwIfQuoteInterrupted(signal);

        try {
          await control.click();
        } catch (error) {
          throwIfQuoteInterrupted(signal);
          throw new NaverQuoteError(
            'QUOTE_INSERT_UNCONFIRMED',
            '네이버 편집기의 인용구 버튼을 실행하지 못했습니다. Chrome 화면에서 다른 메뉴나 팝업이 열려 있는지 확인해 주세요.',
            { cause: error },
          );
        }
        throwIfQuoteInterrupted(signal);
      } else {
        const styles = await ensureQuoteStyles(this.page);
        throwIfQuoteInterrupted(signal);
        const requestedStyleId = validatedStyle === 'random'
          ? styles[
              Math.floor(
                Math.min(Math.max(this.random(), 0), 0.999_999_999) *
                  styles.length,
              )
            ]?.id
          : validatedStyle;
        selectedStyle = styles.find((style) => style.id === requestedStyleId);

        if (!selectedStyle) {
          throw new NaverQuoteError(
            'QUOTE_STYLE_STALE',
            '선택한 인용구 디자인을 현재 네이버 편집기에서 확인하지 못했습니다. 디자인을 다시 불러와 주세요.',
          );
        }

        beforeStyleCount = await getVisibleQuoteStyleCount(
          this.page,
          selectedStyle.id,
        );
        throwIfQuoteInterrupted(signal);

        try {
          await selectedStyle.locator.click();
        } catch (error) {
          throwIfQuoteInterrupted(signal);
          throw new NaverQuoteError(
            'QUOTE_INSERT_UNCONFIRMED',
            '선택한 인용구 디자인을 실행하지 못했습니다. Chrome 화면을 확인해 주세요.',
            { cause: error },
          );
        }
        throwIfQuoteInterrupted(signal);
      }

      const afterCount = await waitForQuoteCount(
        this.page,
        beforeCount + 1,
        signal,
      );
      throwIfQuoteInterrupted(signal);

      if (afterCount !== beforeCount + 1) {
        throw new NaverQuoteError(
          'QUOTE_INSERT_UNCONFIRMED',
          '인용구 삽입을 끝까지 확인하지 못했습니다. 중복 삽입을 막기 위해 빈 새 글에서 다시 시작해 주세요.',
        );
      }

      if (selectedStyle) {
        const afterStyleCount = await getVisibleQuoteStyleCount(
          this.page,
          selectedStyle.id,
        );
        throwIfQuoteInterrupted(signal);

        if (afterStyleCount !== beforeStyleCount + 1) {
          throw new NaverQuoteError(
            'QUOTE_STYLE_MISMATCH',
            '선택한 인용구 디자인이 적용됐는지 확인하지 못했습니다. 중복 삽입을 막기 위해 빈 새 글에서 다시 시작해 주세요.',
          );
        }
      }

      const paragraphsAfterInsertion = await requireMatchingParagraphs(
        this.page,
        request.expectedParagraphs,
      );
      const anchorAfterInsertion =
        paragraphsAfterInsertion[request.paragraphNumber - 1]!;
      const afterPosition = await measureQuotePosition(anchorAfterInsertion);
      const isCorrectPosition = request.position === 'before'
        ? afterPosition.before === beforePosition.before + 1 &&
          afterPosition.after === beforePosition.after
        : afterPosition.after === beforePosition.after + 1 &&
          afterPosition.before === beforePosition.before;

      if (!isCorrectPosition) {
        const beforeDelta = afterPosition.before - beforePosition.before;
        const afterDelta = afterPosition.after - beforePosition.after;
        const detectedPosition = beforeDelta === 1 && afterDelta === 0
          ? '문단 앞'
          : afterDelta === 1 && beforeDelta === 0
            ? '문단 뒤'
            : '판정 불가';
        const requestedPosition = request.position === 'before'
          ? '문단 앞'
          : '문단 뒤';

        throw new NaverQuoteError(
          'QUOTE_POSITION_MISMATCH',
          request.paragraphNumber + '번째 문단의 요청 위치는 ' +
            requestedPosition + ', 실제 감지 위치는 ' + detectedPosition +
            '입니다. 중복 삽입을 막기 위해 빈 새 글에서 다시 시작해 주세요.',
        );
      }

      return {
        stage: 'QUOTE_VERIFIED',
        message: selectedStyle
          ? '선택한 인용구 디자인을 본문 문단 위치에 넣고 결과를 확인했습니다.'
          : '선택한 본문 문단 위치에 인용구를 넣고 결과를 확인했습니다.',
        currentUrl: this.page.url(),
        paragraphNumber: request.paragraphNumber,
        position: request.position,
        quoteCount: afterCount,
        ...(selectedStyle
          ? {
              styleId: selectedStyle.id,
              styleLabel: selectedStyle.label,
            }
          : {}),
      };
    } catch (error) {
      if (error instanceof NaverQuoteError) {
        throw error;
      }

      throw new NaverQuoteError(
        'QUOTE_INSERT_UNCONFIRMED',
        '인용구 삽입을 완료하지 못했습니다. 네이버 편집기 화면을 확인해 주세요.',
        { cause: error },
      );
    }
  }

  async insertDefaultQuote(
    expectedParagraphs: readonly string[],
    paragraphNumber: number,
    position: NaverQuotePosition,
  ): Promise<NaverQuoteInsertionResult> {
    return this.insertQuote(
      expectedParagraphs,
      paragraphNumber,
      position,
    );
  }
}

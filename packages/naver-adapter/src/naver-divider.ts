import type {
  Locator,
  Page,
} from 'playwright-core';
import { placeCaretAtParagraphEdge as setParagraphCaret } from './naver-editor-selection.js';

const DIVIDER_VERIFY_TIMEOUT_MS = 5_000;
const DIVIDER_VERIFY_INTERVAL_MS = 100;

const paragraphSelectors = [
  '.se-component.se-text .se-text-paragraph',
  '.se-section-text .se-text-paragraph',
  '.se-component.se-text p',
] as const;

const dividerComponentSelector = [
  '.se-component.se-horizontalLine',
  '.se-component.se-horizontal-line',
  '.se-component[class*="horizontalLine"]',
].join(', ');

const dividerControlSelector = 'button, [role="button"]';

const dividerStyleOptionSelector = [
  '[class*="se-toolbar-option-insert-horizontal-line-"][class*="-button"]',
  '[class*="se-insert-menu-sub-panel-button-horizontalLine-"]',
].join(', ');

const dividerStyleOrder = [
  'default',
  'line1',
  'line2',
  'line3',
  'line4',
  'line5',
  'line6',
  'line7',
] as const;

export type NaverDividerPosition = 'before' | 'after';
export type NaverDividerStyleId = (typeof dividerStyleOrder)[number];
export type NaverDividerStyleSelection = NaverDividerStyleId | 'random';

export type NaverDividerFailureCode =
  | 'INVALID_DIVIDER_REQUEST'
  | 'DIVIDER_ANCHOR_NOT_FOUND'
  | 'DIVIDER_ANCHOR_MISMATCH'
  | 'DIVIDER_SELECTION_FAILED'
  | 'DIVIDER_CONTROL_NOT_FOUND'
  | 'DIVIDER_CONTROL_AMBIGUOUS'
  | 'DIVIDER_STYLE_CONTROL_NOT_FOUND'
  | 'DIVIDER_STYLE_CONTROL_AMBIGUOUS'
  | 'DIVIDER_STYLE_NOT_FOUND'
  | 'DIVIDER_STYLE_AMBIGUOUS'
  | 'DIVIDER_STYLE_STALE'
  | 'DIVIDER_STYLE_MISMATCH'
  | 'DIVIDER_INSERT_UNCONFIRMED'
  | 'DIVIDER_POSITION_MISMATCH';

export interface NaverDividerStyle {
  readonly id: NaverDividerStyleId;
  readonly label: string;
}

export interface NaverDividerStyleResult {
  readonly stage: 'DIVIDER_STYLES_READY';
  readonly message: string;
  readonly currentUrl: string;
  readonly paragraphNumber: number;
  readonly position: NaverDividerPosition;
  readonly styles: readonly NaverDividerStyle[];
}

export interface NaverDividerInsertionResult {
  readonly stage: 'DIVIDER_VERIFIED';
  readonly message: string;
  readonly currentUrl: string;
  readonly paragraphNumber: number;
  readonly position: NaverDividerPosition;
  readonly dividerCount: number;
  readonly styleId?: NaverDividerStyleId;
  readonly styleLabel?: string;
}

export class NaverDividerError extends Error {
  constructor(
    readonly code: NaverDividerFailureCode,
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = 'NaverDividerError';
  }
}

interface DividerPositionCounts {
  readonly before: number;
  readonly after: number;
}

interface DividerControlCandidate {
  readonly locator: Locator;
  readonly score: number;
}

interface DividerStyleCandidate extends NaverDividerStyle {
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

export function validateDividerStyleSelection(
  value: string,
): NaverDividerStyleSelection {
  if (
    value === 'random' ||
    dividerStyleOrder.includes(value as NaverDividerStyleId)
  ) {
    return value as NaverDividerStyleSelection;
  }

  throw new NaverDividerError(
    'INVALID_DIVIDER_REQUEST',
    '사용할 구분선 디자인을 다시 선택해 주세요.',
  );
}

export function validateDividerRequest(
  expectedParagraphs: readonly string[],
  paragraphNumber: number,
  position: NaverDividerPosition,
): {
  readonly expectedParagraphs: readonly string[];
  readonly paragraphNumber: number;
  readonly position: NaverDividerPosition;
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
    throw new NaverDividerError(
      'INVALID_DIVIDER_REQUEST',
      '구분선을 넣을 문단과 위치를 다시 선택해 주세요.',
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
    throw new NaverDividerError(
      'DIVIDER_ANCHOR_NOT_FOUND',
      '구분선 위치의 기준이 되는 본문 문단을 확인하지 못했습니다.',
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
    throw new NaverDividerError(
      'DIVIDER_ANCHOR_MISMATCH',
      '네이버 본문 문단이 원문과 달라 구분선 위치를 안전하게 정할 수 없습니다.',
    );
  }

  return contentParagraphs.map((paragraph) => paragraph.locator);
}

async function findDividerControls(page: Page): Promise<readonly Locator[]> {
  const candidates: DividerControlCandidate[] = [];

  for (const frame of page.frames()) {
    const controls = frame.locator(dividerControlSelector);
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
        normalizedLabel === '구분선' || normalizedLabel === '구분선 삽입';
      const isSupportingControl = /(종류|디자인|선택)/.test(normalizedLabel);
      const isRelatedLabel =
        normalizedLabel.startsWith('구분선') && !isSupportingControl;
      const hasDividerIdentity = /horizontal[-_]?line/i.test(snapshot.identity);
      const score = isExactLabel
        ? 3
        : isRelatedLabel
          ? 2
          : hasDividerIdentity
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

async function requireUniqueDividerControl(page: Page): Promise<Locator> {
  const controls = await findDividerControls(page);

  if (controls.length === 0) {
    throw new NaverDividerError(
      'DIVIDER_CONTROL_NOT_FOUND',
      '네이버 편집기의 구분선 버튼을 확인하지 못했습니다. Chrome 화면을 확인해 주세요.',
    );
  }

  if (controls.length > 1) {
    throw new NaverDividerError(
      'DIVIDER_CONTROL_AMBIGUOUS',
      '구분선 버튼이 여러 개 보여 안전을 위해 작업을 멈췄습니다.',
    );
  }

  return controls[0]!;
}

function getDividerStyleLabel(styleId: NaverDividerStyleId): string {
  return '구분선 ' + (dividerStyleOrder.indexOf(styleId) + 1);
}

async function findDividerStyleMenuControls(
  page: Page,
): Promise<readonly Locator[]> {
  const candidates: DividerControlCandidate[] = [];

  for (const frame of page.frames()) {
    const controls = frame.locator(dividerControlSelector);
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
      const isExactLabel = normalizedLabel === '구분선 선택';
      const isRelatedLabel =
        normalizedLabel.startsWith('구분선') &&
        /(종류|디자인|스타일|선택|펼치기)/.test(normalizedLabel);
      const hasStyleMenuIdentity =
        /horizontal[-_]?line/i.test(snapshot.identity) &&
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

async function requireUniqueDividerStyleMenuControl(
  page: Page,
): Promise<Locator> {
  const controls = await findDividerStyleMenuControls(page);

  if (controls.length === 0) {
    throw new NaverDividerError(
      'DIVIDER_STYLE_CONTROL_NOT_FOUND',
      '네이버 편집기의 구분선 선택 버튼을 확인하지 못했습니다. Chrome 화면을 확인해 주세요.',
    );
  }

  if (controls.length > 1) {
    throw new NaverDividerError(
      'DIVIDER_STYLE_CONTROL_AMBIGUOUS',
      '구분선 선택 버튼이 여러 개 보여 안전을 위해 작업을 멈췄습니다.',
    );
  }

  return controls[0]!;
}

async function findVisibleDividerStyles(
  page: Page,
): Promise<readonly DividerStyleCandidate[]> {
  const candidates: DividerStyleCandidate[] = [];

  for (const frame of page.frames()) {
    const options = frame.locator(dividerStyleOptionSelector);
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
        /(?:se-toolbar-option-insert-horizontal-line-|se-insert-menu-sub-panel-button-horizontalLine-)(default|line[1-7])(?:-button)?/i,
      );
      const styleId = match?.[1]?.toLowerCase() as
        | NaverDividerStyleId
        | undefined;

      if (!styleId || !dividerStyleOrder.includes(styleId)) {
        continue;
      }

      candidates.push({
        id: styleId,
        label: /^구분선\s*\d+$/.test(snapshot.label)
          ? snapshot.label.replace(/구분선\s*(\d+)/, '구분선 $1')
          : getDividerStyleLabel(styleId),
        locator: option,
      });
    }
  }

  const unique = new Map<NaverDividerStyleId, DividerStyleCandidate>();

  for (const candidate of candidates) {
    if (unique.has(candidate.id)) {
      throw new NaverDividerError(
        'DIVIDER_STYLE_AMBIGUOUS',
        '같은 구분선 디자인이 여러 곳에 보여 안전을 위해 작업을 멈췄습니다.',
      );
    }

    unique.set(candidate.id, candidate);
  }

  return dividerStyleOrder
    .map((styleId) => unique.get(styleId))
    .filter((candidate): candidate is DividerStyleCandidate =>
      Boolean(candidate),
    );
}

async function waitForDividerStyles(
  page: Page,
): Promise<readonly DividerStyleCandidate[]> {
  const maxAttempts = Math.ceil(
    DIVIDER_VERIFY_TIMEOUT_MS / DIVIDER_VERIFY_INTERVAL_MS,
  );
  let previousSignature = '';
  let stableAttempts = 0;

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const styles = await findVisibleDividerStyles(page);
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

    await page.waitForTimeout(DIVIDER_VERIFY_INTERVAL_MS);
  }

  throw new NaverDividerError(
    'DIVIDER_STYLE_NOT_FOUND',
    '구분선 선택창은 열렸지만 디자인 목록을 확인하지 못했습니다. Chrome 화면을 확인해 주세요.',
  );
}

async function ensureDividerStyles(
  page: Page,
): Promise<readonly DividerStyleCandidate[]> {
  const visibleStyles = await findVisibleDividerStyles(page);

  if (visibleStyles.length > 0) {
    return visibleStyles;
  }

  const control = await requireUniqueDividerStyleMenuControl(page);

  try {
    await control.click();
  } catch (error) {
    throw new NaverDividerError(
      'DIVIDER_STYLE_NOT_FOUND',
      '네이버 편집기의 구분선 선택창을 열지 못했습니다. Chrome 화면을 확인해 주세요.',
      { cause: error },
    );
  }

  return waitForDividerStyles(page);
}

async function getVisibleDividerStyleCount(
  page: Page,
  styleId: NaverDividerStyleId,
): Promise<number> {
  let total = 0;
  const layoutClass = 'se-l-' + styleId;

  for (const frame of page.frames()) {
    const components = frame.locator(dividerComponentSelector);
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

async function getVisibleDividerCount(page: Page): Promise<number> {
  let total = 0;

  for (const frame of page.frames()) {
    const components = frame.locator(dividerComponentSelector);
    const count = await components.count();

    for (let index = 0; index < count; index += 1) {
      if (await components.nth(index).isVisible().catch(() => false)) {
        total += 1;
      }
    }
  }

  return total;
}

async function measureDividerPosition(
  anchor: Locator,
): Promise<DividerPositionCounts> {
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
  }, dividerComponentSelector);
}

async function placeCaretAtParagraphEdge(
  page: Page,
  anchor: Locator,
  position: NaverDividerPosition,
): Promise<void> {
  try {
    await setParagraphCaret(page, anchor, position);
  } catch (error) {
    throw new NaverDividerError(
      'DIVIDER_SELECTION_FAILED',
      '구분선을 넣을 본문 위치에 커서를 지정하지 못했습니다. 네이버 편집기에서 본문이 선택 가능한지 확인해 주세요.',
      { cause: error },
    );
  }
}

async function waitForDividerCount(
  page: Page,
  expectedCount: number,
): Promise<number> {
  const maxAttempts = Math.ceil(
    DIVIDER_VERIFY_TIMEOUT_MS / DIVIDER_VERIFY_INTERVAL_MS,
  );
  let actualCount = await getVisibleDividerCount(page);

  for (
    let attempt = 0;
    actualCount !== expectedCount && attempt < maxAttempts;
    attempt += 1
  ) {
    await page.waitForTimeout(DIVIDER_VERIFY_INTERVAL_MS);
    actualCount = await getVisibleDividerCount(page);
  }

  return actualCount;
}

export class NaverDividerAdapter {
  constructor(
    private readonly page: Page,
    private readonly random: () => number = Math.random,
  ) {}

  async listDividerStyles(
    expectedParagraphs: readonly string[],
    paragraphNumber: number,
    position: NaverDividerPosition,
  ): Promise<NaverDividerStyleResult> {
    const request = validateDividerRequest(
      expectedParagraphs,
      paragraphNumber,
      position,
    );

    try {
      const paragraphs = await requireMatchingParagraphs(
        this.page,
        request.expectedParagraphs,
      );
      const anchor = paragraphs[request.paragraphNumber - 1]!;

      await placeCaretAtParagraphEdge(this.page, anchor, request.position);
      await this.page.waitForTimeout(DIVIDER_VERIFY_INTERVAL_MS);
      const styles = await ensureDividerStyles(this.page);

      return {
        stage: 'DIVIDER_STYLES_READY',
        message: '전용 Chrome에 표시된 구분선 디자인을 불러왔습니다.',
        currentUrl: this.page.url(),
        paragraphNumber: request.paragraphNumber,
        position: request.position,
        styles: styles.map(({ id, label }) => ({ id, label })),
      };
    } catch (error) {
      if (error instanceof NaverDividerError) {
        throw error;
      }

      throw new NaverDividerError(
        'DIVIDER_STYLE_NOT_FOUND',
        '구분선 디자인을 불러오지 못했습니다. Chrome 화면을 확인해 주세요.',
        { cause: error },
      );
    }
  }

  async insertDivider(
    expectedParagraphs: readonly string[],
    paragraphNumber: number,
    position: NaverDividerPosition,
    styleSelection?: NaverDividerStyleSelection,
  ): Promise<NaverDividerInsertionResult> {
    const request = validateDividerRequest(
      expectedParagraphs,
      paragraphNumber,
      position,
    );
    const validatedStyle = styleSelection === undefined
      ? undefined
      : validateDividerStyleSelection(styleSelection);

    try {
      const paragraphs = await requireMatchingParagraphs(
        this.page,
        request.expectedParagraphs,
      );
      const anchor = paragraphs[request.paragraphNumber - 1]!;
      const beforeCount = await getVisibleDividerCount(this.page);
      const beforePosition = await measureDividerPosition(anchor);

      await placeCaretAtParagraphEdge(this.page, anchor, request.position);
      await this.page.waitForTimeout(DIVIDER_VERIFY_INTERVAL_MS);

      let selectedStyle: DividerStyleCandidate | undefined;
      let beforeStyleCount = 0;

      if (validatedStyle === undefined) {
        const control = await requireUniqueDividerControl(this.page);

        try {
          await control.click();
        } catch (error) {
          throw new NaverDividerError(
            'DIVIDER_INSERT_UNCONFIRMED',
            '네이버 편집기의 구분선 버튼을 실행하지 못했습니다. Chrome 화면에서 다른 메뉴나 팝업이 열려 있는지 확인해 주세요.',
            { cause: error },
          );
        }
      } else {
        const styles = await ensureDividerStyles(this.page);
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
          throw new NaverDividerError(
            'DIVIDER_STYLE_STALE',
            '선택한 구분선 디자인을 현재 네이버 편집기에서 확인하지 못했습니다. 디자인을 다시 불러와 주세요.',
          );
        }

        beforeStyleCount = await getVisibleDividerStyleCount(
          this.page,
          selectedStyle.id,
        );

        try {
          await selectedStyle.locator.click();
        } catch (error) {
          throw new NaverDividerError(
            'DIVIDER_INSERT_UNCONFIRMED',
            '선택한 구분선 디자인을 실행하지 못했습니다. Chrome 화면을 확인해 주세요.',
            { cause: error },
          );
        }
      }

      const afterCount = await waitForDividerCount(
        this.page,
        beforeCount + 1,
      );

      if (afterCount !== beforeCount + 1) {
        throw new NaverDividerError(
          'DIVIDER_INSERT_UNCONFIRMED',
          '구분선 삽입을 끝까지 확인하지 못했습니다. 중복 삽입을 막기 위해 빈 새 글에서 다시 시작해 주세요.',
        );
      }

      if (selectedStyle) {
        const afterStyleCount = await getVisibleDividerStyleCount(
          this.page,
          selectedStyle.id,
        );

        if (afterStyleCount !== beforeStyleCount + 1) {
          throw new NaverDividerError(
            'DIVIDER_STYLE_MISMATCH',
            '선택한 구분선 디자인이 적용됐는지 확인하지 못했습니다. 중복 삽입을 막기 위해 빈 새 글에서 다시 시작해 주세요.',
          );
        }
      }

      const paragraphsAfterInsertion = await requireMatchingParagraphs(
        this.page,
        request.expectedParagraphs,
      );
      const anchorAfterInsertion =
        paragraphsAfterInsertion[request.paragraphNumber - 1]!;
      const afterPosition = await measureDividerPosition(anchorAfterInsertion);
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

        throw new NaverDividerError(
          'DIVIDER_POSITION_MISMATCH',
          request.paragraphNumber + '번째 문단의 요청 위치는 ' +
            requestedPosition + ', 실제 감지 위치는 ' + detectedPosition +
            '입니다. 중복 삽입을 막기 위해 빈 새 글에서 다시 시작해 주세요.',
        );
      }

      return {
        stage: 'DIVIDER_VERIFIED',
        message: selectedStyle
          ? '선택한 구분선 디자인을 본문 문단 위치에 넣고 결과를 확인했습니다.'
          : '선택한 본문 문단 위치에 구분선을 넣고 결과를 확인했습니다.',
        currentUrl: this.page.url(),
        paragraphNumber: request.paragraphNumber,
        position: request.position,
        dividerCount: afterCount,
        ...(selectedStyle
          ? {
              styleId: selectedStyle.id,
              styleLabel: selectedStyle.label,
            }
          : {}),
      };
    } catch (error) {
      if (error instanceof NaverDividerError) {
        throw error;
      }

      throw new NaverDividerError(
        'DIVIDER_INSERT_UNCONFIRMED',
        '구분선 삽입을 완료하지 못했습니다. 네이버 편집기 화면을 확인해 주세요.',
        { cause: error },
      );
    }
  }
}

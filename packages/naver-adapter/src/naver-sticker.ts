import type {
  Locator,
  Page,
} from 'playwright-core';
import { placeCaretAtParagraphEdge as setParagraphCaret } from './naver-editor-selection.js';

const STICKER_VERIFY_TIMEOUT_MS = 5_000;
const STICKER_VERIFY_INTERVAL_MS = 100;

const paragraphSelectors = [
  '.se-component.se-text .se-text-paragraph',
  '.se-section-text .se-text-paragraph',
  '.se-component.se-text p',
] as const;

const stickerComponentSelector = [
  '.se-component.se-sticker',
  '.se-component[class*="sticker"]',
  '.se-component[data-module*="sticker"]',
].join(', ');

const stickerControlSelector = 'button, [role="button"]';
const stickerItemSelector = [
  '[class*="sticker"] button',
  '[class*="sticker"] [role="button"]',
  '[class*="sticker"] a',
].join(', ');

export type NaverStickerPosition = 'before' | 'after';

export type NaverStickerFailureCode =
  | 'INVALID_STICKER_REQUEST'
  | 'STICKER_ANCHOR_NOT_FOUND'
  | 'STICKER_ANCHOR_MISMATCH'
  | 'STICKER_SELECTION_FAILED'
  | 'STICKER_CONTROL_NOT_FOUND'
  | 'STICKER_CONTROL_AMBIGUOUS'
  | 'STICKER_ITEM_NOT_FOUND'
  | 'STICKER_INSERT_UNCONFIRMED'
  | 'STICKER_POSITION_MISMATCH';

export interface NaverStickerInsertionResult {
  readonly stage: 'STICKER_VERIFIED';
  readonly message: string;
  readonly currentUrl: string;
  readonly paragraphNumber: number;
  readonly position: NaverStickerPosition;
  readonly stickerCount: number;
  readonly stickerLabel: string;
}

export class NaverStickerError extends Error {
  constructor(
    readonly code: NaverStickerFailureCode,
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = 'NaverStickerError';
  }
}

interface PositionedComponentCounts {
  readonly before: number;
  readonly after: number;
}

interface StickerControlCandidate {
  readonly locator: Locator;
  readonly score: number;
}

interface StickerItemCandidate {
  readonly locator: Locator;
  readonly label: string;
}

function normalizeParagraphText(value: string): string {
  return value
    .replace(/\r\n?/g, '\n')
    .replace(/\u00a0/g, ' ')
    .replace(/[\u200b\ufeff]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function validateStickerRequest(
  expectedParagraphs: readonly string[],
  paragraphNumber: number,
  position: NaverStickerPosition,
): {
  readonly expectedParagraphs: readonly string[];
  readonly paragraphNumber: number;
  readonly position: NaverStickerPosition;
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
    throw new NaverStickerError(
      'INVALID_STICKER_REQUEST',
      '스티커를 넣을 문단과 위치를 다시 선택해 주세요.',
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
    throw new NaverStickerError(
      'STICKER_ANCHOR_NOT_FOUND',
      '스티커 위치의 기준이 되는 본문 문단을 확인하지 못했습니다.',
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
    throw new NaverStickerError(
      'STICKER_ANCHOR_MISMATCH',
      '네이버 본문 문단이 원문과 달라 스티커 위치를 안전하게 정할 수 없습니다.',
    );
  }

  return contentParagraphs.map((paragraph) => paragraph.locator);
}

async function placeCaretAtParagraphEdge(
  page: Page,
  anchor: Locator,
  position: NaverStickerPosition,
): Promise<void> {
  try {
    await setParagraphCaret(page, anchor, position);
  } catch (error) {
    throw new NaverStickerError(
      'STICKER_SELECTION_FAILED',
      '스티커를 넣을 본문 위치에 커서를 지정하지 못했습니다. 네이버 편집기에서 본문이 선택 가능한지 확인해 주세요.',
      { cause: error },
    );
  }
}

async function findStickerControls(
  page: Page,
): Promise<readonly Locator[]> {
  const candidates: StickerControlCandidate[] = [];

  for (const frame of page.frames()) {
    const controls = frame.locator(stickerControlSelector);
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
        normalizedLabel === '스티커' || normalizedLabel === '스티커 삽입';
      const isSupportingControl = /(닫기|이전|다음|목록|선택)/.test(
        normalizedLabel,
      );
      const isRelatedLabel =
        normalizedLabel.startsWith('스티커') && !isSupportingControl;
      const hasStickerIdentity = /sticker/i.test(snapshot.identity);
      const score = isExactLabel
        ? 3
        : isRelatedLabel
          ? 2
          : hasStickerIdentity
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

async function requireUniqueStickerControl(page: Page): Promise<Locator> {
  const controls = await findStickerControls(page);

  if (controls.length === 0) {
    throw new NaverStickerError(
      'STICKER_CONTROL_NOT_FOUND',
      '네이버 편집기의 스티커 버튼을 확인하지 못했습니다. Chrome 화면을 확인해 주세요.',
    );
  }

  if (controls.length > 1) {
    throw new NaverStickerError(
      'STICKER_CONTROL_AMBIGUOUS',
      '스티커 버튼이 여러 개 보여 안전을 위해 작업을 멈췄습니다.',
    );
  }

  return controls[0]!;
}

async function findStickerItems(
  page: Page,
): Promise<readonly StickerItemCandidate[]> {
  const candidates: StickerItemCandidate[] = [];

  for (const frame of page.frames()) {
    const items = frame.locator(stickerItemSelector);
    const count = await items.count();

    for (let index = 0; index < count; index += 1) {
      const item = items.nth(index);
      const [visible, snapshot] = await Promise.all([
        item.isVisible().catch(() => false),
        item.evaluate((element) => {
          const image = element.querySelector('img');
          const backgroundVisual = element.querySelector<HTMLElement>(
            '[style*="background-image"]',
          );
          const ariaLabel = element.getAttribute('aria-label') ?? '';
          const title = element.getAttribute('title') ?? '';
          const imageAlt = image?.getAttribute('alt') ?? '';
          const text = element.textContent ?? '';
          const identity =
            element.getAttribute('data-sticker-id') ||
            element.getAttribute('data-id') ||
            element.getAttribute('data-value') ||
            image?.getAttribute('src') ||
            ariaLabel ||
            title ||
            imageAlt ||
            backgroundVisual?.getAttribute('style') ||
            '';

          return {
            label: (ariaLabel || title || imageAlt || text)
              .replace(/\s+/g, ' ')
              .trim(),
            identity,
            hasVisual: Boolean(
              image ||
              element.querySelector('svg') ||
              backgroundVisual,
            ),
          };
        }).catch(() => ({ label: '', identity: '', hasVisual: false })),
      ]);
      const isNavigation = /(닫기|이전|다음|더보기|목록)/.test(snapshot.label);

      if (
        visible &&
        snapshot.hasVisual &&
        snapshot.identity.length > 0 &&
        !isNavigation
      ) {
        candidates.push({
          locator: item,
          label: snapshot.label || '기본 스티커',
        });
      }
    }
  }

  return candidates;
}

async function waitForFirstStickerItem(
  page: Page,
): Promise<StickerItemCandidate> {
  const maxAttempts = Math.ceil(
    STICKER_VERIFY_TIMEOUT_MS / STICKER_VERIFY_INTERVAL_MS,
  );

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const items = await findStickerItems(page);

    if (items.length > 0) {
      return items[0]!;
    }

    await page.waitForTimeout(STICKER_VERIFY_INTERVAL_MS);
  }

  throw new NaverStickerError(
    'STICKER_ITEM_NOT_FOUND',
    '스티커 선택창은 열렸지만 선택할 기본 스티커를 확인하지 못했습니다. Chrome 화면을 확인해 주세요.',
  );
}

async function getVisibleStickerCount(page: Page): Promise<number> {
  let total = 0;

  for (const frame of page.frames()) {
    const components = frame.locator(stickerComponentSelector);
    const count = await components.count();

    for (let index = 0; index < count; index += 1) {
      if (await components.nth(index).isVisible().catch(() => false)) {
        total += 1;
      }
    }
  }

  return total;
}

async function measureStickerPosition(
  anchor: Locator,
): Promise<PositionedComponentCounts> {
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
  }, stickerComponentSelector);
}
async function waitForStickerCount(
  page: Page,
  expectedCount: number,
): Promise<number> {
  const maxAttempts = Math.ceil(
    STICKER_VERIFY_TIMEOUT_MS / STICKER_VERIFY_INTERVAL_MS,
  );
  let actualCount = await getVisibleStickerCount(page);

  for (
    let attempt = 0;
    actualCount !== expectedCount && attempt < maxAttempts;
    attempt += 1
  ) {
    await page.waitForTimeout(STICKER_VERIFY_INTERVAL_MS);
    actualCount = await getVisibleStickerCount(page);
  }

  return actualCount;
}

export class NaverStickerAdapter {
  constructor(private readonly page: Page) {}

  async insertDefaultSticker(
    expectedParagraphs: readonly string[],
    paragraphNumber: number,
    position: NaverStickerPosition,
  ): Promise<NaverStickerInsertionResult> {
    const request = validateStickerRequest(
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
      const beforeCount = await getVisibleStickerCount(this.page);
      const beforePosition = await measureStickerPosition(anchor);

      await placeCaretAtParagraphEdge(this.page, anchor, request.position);
      await this.page.waitForTimeout(STICKER_VERIFY_INTERVAL_MS);
      const control = await requireUniqueStickerControl(this.page);
      await control.click();
      const stickerItem = await waitForFirstStickerItem(this.page);
      await stickerItem.locator.click();

      const afterCount = await waitForStickerCount(
        this.page,
        beforeCount + 1,
      );

      if (afterCount !== beforeCount + 1) {
        throw new NaverStickerError(
          'STICKER_INSERT_UNCONFIRMED',
          '스티커 삽입을 끝까지 확인하지 못했습니다. 중복 삽입을 막기 위해 빈 새 글에서 다시 시작해 주세요.',
        );
      }

      const paragraphsAfterInsertion = await requireMatchingParagraphs(
        this.page,
        request.expectedParagraphs,
      );
      const anchorAfterInsertion =
        paragraphsAfterInsertion[request.paragraphNumber - 1]!;
      const afterPosition = await measureStickerPosition(anchorAfterInsertion);
      const isCorrectPosition = request.position === 'before'
        ? afterPosition.before === beforePosition.before + 1 &&
          afterPosition.after === beforePosition.after
        : afterPosition.after === beforePosition.after + 1 &&
          afterPosition.before === beforePosition.before;

      if (!isCorrectPosition) {
        throw new NaverStickerError(
          'STICKER_POSITION_MISMATCH',
          '스티커가 선택한 문단 위치에 삽입됐는지 확인하지 못했습니다. 중복 삽입을 막기 위해 빈 새 글에서 다시 시작해 주세요.',
        );
      }

      return {
        stage: 'STICKER_VERIFIED',
        message: '선택한 본문 문단 위치에 기본 스티커를 넣고 결과를 확인했습니다.',
        currentUrl: this.page.url(),
        paragraphNumber: request.paragraphNumber,
        position: request.position,
        stickerCount: afterCount,
        stickerLabel: stickerItem.label,
      };
    } catch (error) {
      if (error instanceof NaverStickerError) {
        throw error;
      }

      throw new NaverStickerError(
        'STICKER_INSERT_UNCONFIRMED',
        '스티커 삽입을 완료하지 못했습니다. 네이버 편집기 화면을 확인해 주세요.',
        { cause: error },
      );
    }
  }
}
import type {
  Frame,
  Locator,
  Page,
} from 'playwright-core';
import {
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import {
  NaverStickerAdapter,
  NaverStickerError,
  type NaverStickerPosition,
  validateStickerRequest,
} from '../src/naver-sticker.js';

interface StickerPageOptions {
  readonly paragraphs?: readonly string[];
  readonly controlCount?: number;
  readonly itemCount?: number;
  readonly insertSticker?: boolean;
  readonly verifyPosition?: boolean;
}

function createCollection(locators: readonly Locator[]) {
  return {
    count: vi.fn().mockResolvedValue(locators.length),
    nth: vi.fn((index: number) => locators[index]),
  };
}

function createStickerPage(options: StickerPageOptions = {}): {
  readonly page: Page;
  readonly controlClick: ReturnType<typeof vi.fn>;
  readonly itemClick: ReturnType<typeof vi.fn>;
} {
  const paragraphTexts = options.paragraphs ?? [
    '첫 번째 문단입니다.',
    '두 번째 문단입니다.',
    '세 번째 문단입니다.',
  ];
  const controlCount = options.controlCount ?? 1;
  const itemCount = options.itemCount ?? 1;
  const shouldInsert = options.insertSticker ?? true;
  const shouldVerifyPosition = options.verifyPosition ?? true;
  let pickerOpen = false;
  let stickerCount = 0;
  const stickerGaps: number[] = [];
  let pendingParagraphIndex: number | null = null;
  let pendingPosition: NaverStickerPosition | null = null;

  const paragraphs = paragraphTexts.map((text, paragraphIndex) => ({
    boundingBox: vi.fn().mockResolvedValue({
      x: 0,
      y: 0,
      width: 200,
      height: 40,
    }),
    click: vi.fn().mockResolvedValue(undefined),
    evaluate: vi.fn(async (
      _callback: unknown,
      argument: string,
    ) => {
      if (argument === 'before' || argument === 'after') {
        pendingParagraphIndex = paragraphIndex;
        pendingPosition = argument;
        return true;
      }

      return {
        before: stickerGaps.filter((gap) => gap <= paragraphIndex).length,
        after: stickerGaps.filter((gap) => gap > paragraphIndex).length,
      };
    }),
    innerText: vi.fn().mockResolvedValue(text),
    isVisible: vi.fn().mockResolvedValue(true),
  } as unknown as Locator));
  const controlClick = vi.fn(async () => {
    pickerOpen = true;
  });
  const controls = Array.from({ length: controlCount }, () => ({
    click: controlClick,
    evaluate: vi.fn().mockResolvedValue({
      label: '스티커',
      identity: 'se-toolbar-option-insert-sticker-button',
    }),
    isVisible: vi.fn().mockResolvedValue(true),
  } as unknown as Locator));
  const itemClick = vi.fn(async () => {
    if (
      !shouldInsert ||
      pendingParagraphIndex === null ||
      !pendingPosition
    ) {
      return;
    }

    stickerCount += 1;
    const insertedPosition = shouldVerifyPosition
      ? pendingPosition
      : pendingPosition === 'before'
        ? 'after'
        : 'before';
    stickerGaps.push(
      pendingParagraphIndex + (insertedPosition === 'after' ? 1 : 0),
    );
  });
  const items = Array.from({ length: itemCount }, (_, index) => ({
    click: itemClick,
    evaluate: vi.fn().mockResolvedValue({
      label: '기본 스티커 ' + (index + 1),
      identity: 'sticker-' + (index + 1),
      hasVisual: true,
    }),
    isVisible: vi.fn(async () => pickerOpen),
  } as unknown as Locator));
  const emptyCollection = createCollection([]);

  const frame = {
    locator: vi.fn((selector: string) => {
      if (selector === '.se-component.se-text .se-text-paragraph') {
        return createCollection(paragraphs);
      }

      if (selector === 'button, [role="button"]') {
        return createCollection(controls);
      }

      if (selector === [
        '[class*="sticker"] button',
        '[class*="sticker"] [role="button"]',
        '[class*="sticker"] a',
      ].join(', ')) {
        return createCollection(items);
      }

      if (selector.includes('.se-component.se-sticker')) {
        return {
          count: vi.fn(async () => stickerCount),
          nth: vi.fn(() => ({
            isVisible: vi.fn().mockResolvedValue(true),
          } as unknown as Locator)),
        };
      }

      return emptyCollection;
    }),
  } as unknown as Frame;

  const page = {
    frames: vi.fn().mockReturnValue([frame]),
    keyboard: {
      press: vi.fn().mockResolvedValue(undefined),
    },
    url: vi.fn().mockReturnValue(
      'https://blog.naver.com/green_fork?Redirect=Write&categoryNo=1',
    ),
    waitForTimeout: vi.fn().mockResolvedValue(undefined),
  } as unknown as Page;

  return { page, controlClick, itemClick };
}

describe('네이버 스티커 요청 검사', () => {
  it('문단 번호와 앞·뒤 위치를 검사한다', () => {
    expect(
      validateStickerRequest([' 첫 문단 ', '둘째 문단'], 2, 'after'),
    ).toEqual({
      expectedParagraphs: ['첫 문단', '둘째 문단'],
      paragraphNumber: 2,
      position: 'after',
    });

    expect(() =>
      validateStickerRequest(['첫 문단'], 2, 'after'),
    ).toThrowError(
      expect.objectContaining({ code: 'INVALID_STICKER_REQUEST' }),
    );
  });
});

describe('네이버 스티커 삽입', () => {
  it.each([
    ['before', 1],
    ['after', 1],
    ['before', 2],
    ['after', 2],
    ['before', 3],
    ['after', 3],
  ] as const)(
    '선택한 문단의 %s 위치에 첫 번째 기본 스티커를 넣고 검증한다',
    async (position, paragraphNumber) => {
      const { page, controlClick, itemClick } = createStickerPage();
      const adapter = new NaverStickerAdapter(page);

      await expect(
        adapter.insertDefaultSticker(
          [
            '첫 번째 문단입니다.',
            '두 번째 문단입니다.',
            '세 번째 문단입니다.',
          ],
          paragraphNumber,
          position,
        ),
      ).resolves.toEqual({
        stage: 'STICKER_VERIFIED',
        message: '선택한 본문 문단 위치에 기본 스티커를 넣고 결과를 확인했습니다.',
        currentUrl:
          'https://blog.naver.com/green_fork?Redirect=Write&categoryNo=1',
        paragraphNumber,
        position,
        stickerCount: 1,
        stickerLabel: '기본 스티커 1',
      });
      expect(controlClick).toHaveBeenCalledOnce();
      expect(itemClick).toHaveBeenCalledOnce();
    },
  );

  it('선택창의 여러 스티커 중 첫 번째 기본 항목만 누른다', async () => {
    const { page, itemClick } = createStickerPage({ itemCount: 3 });
    const adapter = new NaverStickerAdapter(page);

    await adapter.insertDefaultSticker(
      [
        '첫 번째 문단입니다.',
        '두 번째 문단입니다.',
        '세 번째 문단입니다.',
      ],
      2,
      'after',
    );

    expect(itemClick).toHaveBeenCalledOnce();
  });

  it('본문 문단이 원문과 다르면 스티커 메뉴를 열지 않는다', async () => {
    const { page, controlClick } = createStickerPage({
      paragraphs: ['변경된 문단입니다.'],
    });
    const adapter = new NaverStickerAdapter(page);

    await expect(
      adapter.insertDefaultSticker(['원문 문단입니다.'], 1, 'after'),
    ).rejects.toMatchObject({ code: 'STICKER_ANCHOR_MISMATCH' });
    expect(controlClick).not.toHaveBeenCalled();
  });

  it('스티커 버튼이 여러 개면 임의로 선택하지 않는다', async () => {
    const { page, controlClick } = createStickerPage({ controlCount: 2 });
    const adapter = new NaverStickerAdapter(page);

    await expect(
      adapter.insertDefaultSticker(
        [
          '첫 번째 문단입니다.',
          '두 번째 문단입니다.',
          '세 번째 문단입니다.',
        ],
        1,
        'after',
      ),
    ).rejects.toMatchObject({ code: 'STICKER_CONTROL_AMBIGUOUS' });
    expect(controlClick).not.toHaveBeenCalled();
  });

  it('선택할 스티커를 찾지 못하면 삽입하지 않는다', async () => {
    const { page, itemClick } = createStickerPage({ itemCount: 0 });
    const adapter = new NaverStickerAdapter(page);

    await expect(
      adapter.insertDefaultSticker(
        [
          '첫 번째 문단입니다.',
          '두 번째 문단입니다.',
          '세 번째 문단입니다.',
        ],
        1,
        'after',
      ),
    ).rejects.toMatchObject({ code: 'STICKER_ITEM_NOT_FOUND' });
    expect(itemClick).not.toHaveBeenCalled();
  });

  it('삽입 개수가 늘지 않으면 중복 재시도 없이 중단한다', async () => {
    const { page, itemClick } = createStickerPage({ insertSticker: false });
    const adapter = new NaverStickerAdapter(page);

    await expect(
      adapter.insertDefaultSticker(
        [
          '첫 번째 문단입니다.',
          '두 번째 문단입니다.',
          '세 번째 문단입니다.',
        ],
        1,
        'after',
      ),
    ).rejects.toMatchObject({ code: 'STICKER_INSERT_UNCONFIRMED' });
    expect(itemClick).toHaveBeenCalledOnce();
  });

  it('삽입 위치가 선택과 다르면 성공으로 처리하지 않는다', async () => {
    const { page } = createStickerPage({ verifyPosition: false });
    const adapter = new NaverStickerAdapter(page);

    await expect(
      adapter.insertDefaultSticker(
        [
          '첫 번째 문단입니다.',
          '두 번째 문단입니다.',
          '세 번째 문단입니다.',
        ],
        2,
        'before',
      ),
    ).rejects.toMatchObject({ code: 'STICKER_POSITION_MISMATCH' });
  });
});

expect(NaverStickerError).toBeDefined();
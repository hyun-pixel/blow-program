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
  readonly categoryLabels?: readonly string[];
  readonly naverLikeMarkup?: boolean;
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
  readonly categoryClicks: readonly ReturnType<typeof vi.fn>[];
  readonly itemClick: ReturnType<typeof vi.fn>;
  readonly clickedItemIndexes: readonly number[];
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
  const categoryLabels = options.categoryLabels ?? ['표정', '동물'];
  let pickerOpen = false;
  let selectedCategoryIndex = 0;
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
  const clickedItemIndexes: number[] = [];
  const itemClick = vi.fn(async (itemIndex = 0) => {
    clickedItemIndexes.push(itemIndex);
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
  const categoryClicks = categoryLabels.map((_, index) =>
    vi.fn(() => {
      selectedCategoryIndex = index;
    }),
  );
  const categories = categoryLabels.map((label, index) => ({
    click: categoryClicks[index],
    evaluate: vi.fn(async () => options.naverLikeMarkup
      ? {
          label,
          rawText: label,
          identity: label,
          isSelected: selectedCategoryIndex === index,
          isUtility: false,
          isDirectPack: true,
        }
      : {
          label,
          identity: 'category-' + (index + 1),
        }),
    isVisible: vi.fn(async () => pickerOpen),
  } as unknown as Locator));
  const items = Array.from({ length: itemCount }, (_, index) => ({
    click: vi.fn(() => itemClick(index)),
    evaluate: vi.fn(async () => {
      const prefix = categoryLabels[selectedCategoryIndex] ?? 'sticker';

      return options.naverLikeMarkup
        ? {
            label: prefix + '-' + (index + 1),
            identity: prefix + '-' + (index + 1),
            hasVisual: false,
            isDirectStickerItem: true,
            isCategoryControl: false,
          }
        : {
            label: '기본 스티커 ' + (index + 1),
            identity: 'sticker-' + (index + 1),
            hasVisual: true,
          };
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
        '.se-sidebar-container-sticker .se-sidebar-list.se-is-on button.se-sidebar-element-sticker',
        '[class*="sticker"] button',
        '[class*="sticker"] [role="button"]',
        '[class*="sticker"] a',
      ].join(', ')) {
        return createCollection(items);
      }

      if (selector === [
        '.se-sidebar-container-sticker .se-panel-tab-list button.se-tab-button:not(.se-tab-button-history)',
        '[class*="sticker"] [role="tab"]',
        '[class*="sticker"] [data-category-id]',
        '[class*="sticker"] [data-pack-id]',
        '[class*="sticker"] [data-group-id]',
      ].join(', ')) {
        return createCollection(categories);
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

  return {
    page,
    controlClick,
    categoryClicks,
    itemClick,
    clickedItemIndexes,
  };
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

describe('네이버 스티커 묶음 선택과 무작위 삽입', () => {
  const paragraphs = [
    '첫 번째 문단입니다.',
    '두 번째 문단입니다.',
    '세 번째 문단입니다.',
  ];

  it('전용 Chrome에 표시된 스티커 묶음을 불러온다', async () => {
    const { page, controlClick } = createStickerPage({
      categoryLabels: ['표정', '동물', '음식'],
    });
    const adapter = new NaverStickerAdapter(page);

    await expect(
      adapter.listStickerCategories(paragraphs, 2, 'after'),
    ).resolves.toMatchObject({
      stage: 'STICKER_CATEGORIES_READY',
      paragraphNumber: 2,
      position: 'after',
      categories: [
        { label: '표정' },
        { label: '동물' },
        { label: '음식' },
      ],
    });
    expect(controlClick).toHaveBeenCalledOnce();
  });

  it('실제 네이버 내부 묶음 이름과 CSS형 스티커를 구분한다', async () => {
    const { page, clickedItemIndexes } = createStickerPage({
      itemCount: 4,
      categoryLabels: ['motion2d_01', 'cafe_004'],
      naverLikeMarkup: true,
    });
    const adapter = new NaverStickerAdapter(page, () => 0.5);
    const categoryResult = await adapter.listStickerCategories(
      paragraphs,
      1,
      'after',
    );

    expect(categoryResult.categories.map((category) => category.label))
      .toEqual(['스티커 묶음 1', '스티커 묶음 2']);

    await adapter.insertRandomSticker(
      paragraphs,
      1,
      'after',
      categoryResult.categories[1]!.id,
    );

    expect(clickedItemIndexes).toEqual([2]);
  });

  it('사용자가 고른 묶음 안에서 무작위 한 항목만 삽입한다', async () => {
    const {
      page,
      categoryClicks,
      itemClick,
      clickedItemIndexes,
    } = createStickerPage({
      itemCount: 4,
      categoryLabels: ['표정', '동물'],
    });
    const adapter = new NaverStickerAdapter(page, () => 0.75);
    const categoryResult = await adapter.listStickerCategories(
      paragraphs,
      2,
      'before',
    );
    const selectedCategory = categoryResult.categories[1]!;

    await expect(
      adapter.insertRandomSticker(
        paragraphs,
        2,
        'before',
        selectedCategory.id,
      ),
    ).resolves.toMatchObject({
      stage: 'STICKER_VERIFIED',
      paragraphNumber: 2,
      position: 'before',
      categoryId: selectedCategory.id,
      categoryLabel: '동물',
      stickerLabel: '기본 스티커 4',
    });
    expect(categoryClicks[1]).toHaveBeenCalledOnce();
    expect(itemClick).toHaveBeenCalledOnce();
    expect(clickedItemIndexes).toEqual([3]);
  });

  it('묶음을 다시 불러오지 않고 임의 ID를 보내면 삽입하지 않는다', async () => {
    const { page, itemClick } = createStickerPage();
    const adapter = new NaverStickerAdapter(page);

    await expect(
      adapter.insertRandomSticker(
        paragraphs,
        1,
        'after',
        'unknown-category',
      ),
    ).rejects.toMatchObject({ code: 'STICKER_CATEGORY_STALE' });
    expect(itemClick).not.toHaveBeenCalled();
  });

  it('이름이 같은 묶음이 여러 개면 사용자에게 선택시키지 않는다', async () => {
    const { page, categoryClicks } = createStickerPage({
      categoryLabels: ['표정', '표정'],
    });
    const adapter = new NaverStickerAdapter(page);

    await expect(
      adapter.listStickerCategories(paragraphs, 1, 'after'),
    ).rejects.toMatchObject({ code: 'STICKER_CATEGORY_AMBIGUOUS' });
    expect(categoryClicks.every((click) => click.mock.calls.length === 0))
      .toBe(true);
  });

  it('같은 묶음에서 연속 삽입할 때 직전 항목을 피한다', async () => {
    const { page, clickedItemIndexes } = createStickerPage({
      itemCount: 3,
      categoryLabels: ['표정'],
    });
    const adapter = new NaverStickerAdapter(page, () => 0);
    const categoryResult = await adapter.listStickerCategories(
      paragraphs,
      1,
      'after',
    );
    const categoryId = categoryResult.categories[0]!.id;

    await adapter.insertRandomSticker(
      paragraphs,
      1,
      'after',
      categoryId,
    );
    await adapter.insertRandomSticker(
      paragraphs,
      1,
      'after',
      categoryId,
    );

    expect(clickedItemIndexes).toEqual([0, 1]);
  });
});

expect(NaverStickerError).toBeDefined();
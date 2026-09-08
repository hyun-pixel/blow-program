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
  NaverQuoteAdapter,
  NaverQuoteError,
  type NaverQuotePosition,
  type NaverQuoteStyleId,
  validateQuoteRequest,
  validateQuoteStyleSelection,
} from '../src/naver-quote.js';

interface QuotePageOptions {
  readonly abortAfterCaret?: AbortController;
  readonly abortAfterStyleMenu?: AbortController;
  readonly paragraphs?: readonly string[];
  readonly controlCount?: number;
  readonly controlLabel?: string;
  readonly controlVisibleAfterCaret?: boolean;
  readonly insertQuote?: boolean;
  readonly verifyPosition?: boolean;
  readonly styleIds?: readonly NaverQuoteStyleId[];
  readonly styleMenuControlCount?: number;
  readonly insertedStyleOverride?: NaverQuoteStyleId;
}

const allQuoteStyleIds = [
  'default',
  'quotation_line',
  'quotation_bubble',
  'quotation_underline',
  'quotation_postit',
  'quotation_corner',
] as const;

function createCollection(locators: readonly Locator[]) {
  return {
    count: vi.fn().mockResolvedValue(locators.length),
    nth: vi.fn((index: number) => locators[index]),
  };
}

function createQuotePage(options: QuotePageOptions = {}): {
  readonly page: Page;
  readonly controlClick: ReturnType<typeof vi.fn>;
  readonly styleMenuClick: ReturnType<typeof vi.fn>;
  readonly styleOptionClicks: ReadonlyMap<
    NaverQuoteStyleId,
    ReturnType<typeof vi.fn>
  >;
} {
  const paragraphTexts = options.paragraphs ?? [
    '첫 번째 문단입니다.',
    '두 번째 문단입니다.',
    '세 번째 문단입니다.',
  ];
  const controlCount = options.controlCount ?? 1;
  const styleIds = options.styleIds ?? allQuoteStyleIds;
  const styleMenuControlCount = options.styleMenuControlCount ?? 1;
  const shouldInsert = options.insertQuote ?? true;
  const shouldVerifyPosition = options.verifyPosition ?? true;
  let quoteCount = 0;
  const quoteGaps: number[] = [];
  const insertedStyles: NaverQuoteStyleId[] = [];
  let pendingParagraphIndex: number | null = null;
  let pendingPosition: NaverQuotePosition | null = null;
  let styleMenuOpen = false;

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
        styleMenuOpen = false;
        options.abortAfterCaret?.abort();
        return true;
      }

      return {
        before: quoteGaps.filter((gap) => gap <= paragraphIndex).length,
        after: quoteGaps.filter((gap) => gap > paragraphIndex).length,
      };
    }),
    innerText: vi.fn().mockResolvedValue(text),
    isVisible: vi.fn().mockResolvedValue(true),
  } as unknown as Locator));

  const insertAtPendingPosition = (
    requestedStyle: NaverQuoteStyleId,
  ): void => {
    if (
      !shouldInsert ||
      pendingParagraphIndex === null ||
      !pendingPosition
    ) {
      return;
    }

    quoteCount += 1;
    insertedStyles.push(
      options.insertedStyleOverride ?? requestedStyle,
    );
    const insertedPosition = shouldVerifyPosition
      ? pendingPosition
      : pendingPosition === 'before'
        ? 'after'
        : 'before';
    quoteGaps.push(
      pendingParagraphIndex + (insertedPosition === 'after' ? 1 : 0),
    );
  };

  const controlClick = vi.fn(async () => {
    insertAtPendingPosition('default');
  });
  const mainControls = Array.from({ length: controlCount }, () => ({
    click: controlClick,
    evaluate: vi.fn().mockResolvedValue({
      label: options.controlLabel ?? '인용구',
      identity: 'se-toolbar-option-insert-quotation-button',
    }),
    isVisible: vi.fn(async () =>
      options.controlVisibleAfterCaret ? pendingPosition !== null : true,
    ),
  } as unknown as Locator));

  const styleMenuClick = vi.fn(async () => {
    styleMenuOpen = true;
    options.abortAfterStyleMenu?.abort();
  });
  const styleMenuControls = Array.from(
    { length: styleMenuControlCount },
    () => ({
      click: styleMenuClick,
      evaluate: vi.fn().mockResolvedValue({
        label: '인용구 선택',
        identity: 'se-toolbar-select-button se-select-option-quotation',
      }),
      isVisible: vi.fn().mockResolvedValue(true),
    } as unknown as Locator),
  );

  const styleOptionClicks = new Map<
    NaverQuoteStyleId,
    ReturnType<typeof vi.fn>
  >();
  const styleOptions = styleIds.map((styleId) => {
    const click = vi.fn(async () => {
      insertAtPendingPosition(styleId);
      styleMenuOpen = false;
    });
    styleOptionClicks.set(styleId, click);

    return {
      click,
      evaluate: vi.fn().mockResolvedValue({
        label: '인용구 ' + (allQuoteStyleIds.indexOf(styleId) + 1),
        identity:
          'se-toolbar-option-insert-quotation-' +
          styleId +
          '-button',
      }),
      isVisible: vi.fn(async () => styleMenuOpen),
    } as unknown as Locator;
  });
  const emptyCollection = createCollection([]);

  const frame = {
    locator: vi.fn((selector: string) => {
      if (selector === '.se-component.se-text .se-text-paragraph') {
        return createCollection(paragraphs);
      }

      if (selector === 'button, [role="button"]') {
        return createCollection([
          ...mainControls,
          ...styleMenuControls,
        ]);
      }

      if (
        selector.includes(
          'se-toolbar-option-insert-quotation-',
        )
      ) {
        return createCollection(styleOptions);
      }

      if (selector.includes('.se-component.se-quotation')) {
        return {
          count: vi.fn(async () => quoteCount),
          nth: vi.fn((index: number) => ({
            evaluate: vi.fn(async (
              _callback: unknown,
              expectedClass: string,
            ) => expectedClass === 'se-l-' + insertedStyles[index]),
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
    styleMenuClick,
    styleOptionClicks,
  };
}
describe('네이버 인용구 요청 검사', () => {
  it('문단 번호와 앞·뒤 위치를 검사한다', () => {
    expect(
      validateQuoteRequest([' 첫 문단 ', '둘째 문단'], 2, 'after'),
    ).toEqual({
      expectedParagraphs: ['첫 문단', '둘째 문단'],
      paragraphNumber: 2,
      position: 'after',
    });

    expect(() =>
      validateQuoteRequest(['첫 문단'], 2, 'after'),
    ).toThrowError(
      expect.objectContaining({ code: 'INVALID_QUOTE_REQUEST' }),
    );
  });

  it('무작위와 6종 디자인 외의 값은 거부한다', () => {
    expect(validateQuoteStyleSelection('random')).toBe('random');
    expect(validateQuoteStyleSelection('quotation_corner')).toBe(
      'quotation_corner',
    );
    expect(() =>
      validateQuoteStyleSelection('quotation_unknown'),
    ).toThrowError(
      expect.objectContaining({ code: 'INVALID_QUOTE_REQUEST' }),
    );
  });
});

describe('네이버 인용구 디자인', () => {
  it('중단 신호를 받으면 디자인 선택창을 열지 않는다', async () => {
    const controller = new AbortController();
    const { page, styleMenuClick } = createQuotePage({
      abortAfterCaret: controller,
    });
    const adapter = new NaverQuoteAdapter(page);

    await expect(adapter.listQuoteStyles(
      [
        '첫 번째 문단입니다.',
        '두 번째 문단입니다.',
        '세 번째 문단입니다.',
      ],
      2,
      'after',
      controller.signal,
    )).rejects.toMatchObject({
      code: 'QUOTE_OPERATION_INTERRUPTED',
    });

    expect(styleMenuClick).not.toHaveBeenCalled();
  });

  it('디자인 선택창을 연 뒤 중단되면 디자인을 클릭하지 않는다', async () => {
    const controller = new AbortController();
    const {
      page,
      styleMenuClick,
      styleOptionClicks,
    } = createQuotePage({
      abortAfterStyleMenu: controller,
    });
    const adapter = new NaverQuoteAdapter(page);

    await expect(adapter.insertQuote(
      [
        '첫 번째 문단입니다.',
        '두 번째 문단입니다.',
        '세 번째 문단입니다.',
      ],
      1,
      'before',
      'quotation_postit',
      controller.signal,
    )).rejects.toMatchObject({
      code: 'QUOTE_OPERATION_INTERRUPTED',
    });

    expect(styleMenuClick).toHaveBeenCalledOnce();
    expect(
      styleOptionClicks.get('quotation_postit'),
    ).not.toHaveBeenCalled();
  });

  it('현재 편집기에 표시된 6종 디자인을 순서대로 불러온다', async () => {
    const {
      page,
      controlClick,
      styleMenuClick,
    } = createQuotePage();
    const adapter = new NaverQuoteAdapter(page);

    await expect(
      adapter.listQuoteStyles(
        [
          '첫 번째 문단입니다.',
          '두 번째 문단입니다.',
          '세 번째 문단입니다.',
        ],
        2,
        'after',
      ),
    ).resolves.toEqual({
      stage: 'QUOTE_STYLES_READY',
      message: '전용 Chrome에 표시된 인용구 디자인을 불러왔습니다.',
      currentUrl:
        'https://blog.naver.com/green_fork?Redirect=Write&categoryNo=1',
      paragraphNumber: 2,
      position: 'after',
      styles: allQuoteStyleIds.map((id, index) => ({
        id,
        label: '인용구 ' + (index + 1),
      })),
    });
    expect(styleMenuClick).toHaveBeenCalledOnce();
    expect(controlClick).not.toHaveBeenCalled();
  });

  it('사용자가 고른 한 가지 디자인을 삽입하고 적용 결과를 검증한다', async () => {
    const {
      page,
      controlClick,
      styleOptionClicks,
    } = createQuotePage();
    const adapter = new NaverQuoteAdapter(page);

    await expect(
      adapter.insertQuote(
        [
          '첫 번째 문단입니다.',
          '두 번째 문단입니다.',
          '세 번째 문단입니다.',
        ],
        1,
        'before',
        'quotation_postit',
      ),
    ).resolves.toMatchObject({
      stage: 'QUOTE_VERIFIED',
      paragraphNumber: 1,
      position: 'before',
      quoteCount: 1,
      styleId: 'quotation_postit',
      styleLabel: '인용구 5',
    });
    expect(
      styleOptionClicks.get('quotation_postit'),
    ).toHaveBeenCalledOnce();
    expect(controlClick).not.toHaveBeenCalled();
  });

  it('무작위 선택은 현재 보이는 디자인 중 정확히 하나만 고른다', async () => {
    const {
      page,
      styleOptionClicks,
    } = createQuotePage();
    const adapter = new NaverQuoteAdapter(page, () => 0.999_999);

    await expect(
      adapter.insertQuote(
        [
          '첫 번째 문단입니다.',
          '두 번째 문단입니다.',
          '세 번째 문단입니다.',
        ],
        3,
        'after',
        'random',
      ),
    ).resolves.toMatchObject({
      stage: 'QUOTE_VERIFIED',
      styleId: 'quotation_corner',
      styleLabel: '인용구 6',
    });
    expect(
      styleOptionClicks.get('quotation_corner'),
    ).toHaveBeenCalledOnce();
  });

  it('선택한 디자인이 더 이상 보이지 않으면 삽입하지 않는다', async () => {
    const {
      page,
      controlClick,
    } = createQuotePage({
      styleIds: ['default', 'quotation_line'],
    });
    const adapter = new NaverQuoteAdapter(page);

    await expect(
      adapter.insertQuote(
        [
          '첫 번째 문단입니다.',
          '두 번째 문단입니다.',
          '세 번째 문단입니다.',
        ],
        1,
        'after',
        'quotation_corner',
      ),
    ).rejects.toMatchObject({
      code: 'QUOTE_STYLE_STALE',
    });
    expect(controlClick).not.toHaveBeenCalled();
  });

  it('클릭 뒤 다른 디자인이 적용되면 성공으로 처리하지 않는다', async () => {
    const { page } = createQuotePage({
      insertedStyleOverride: 'quotation_line',
    });
    const adapter = new NaverQuoteAdapter(page);

    await expect(
      adapter.insertQuote(
        [
          '첫 번째 문단입니다.',
          '두 번째 문단입니다.',
          '세 번째 문단입니다.',
        ],
        2,
        'after',
        'quotation_postit',
      ),
    ).rejects.toMatchObject({
      code: 'QUOTE_STYLE_MISMATCH',
    });
  });
});

describe('네이버 인용구 삽입', () => {
  it.each([
    ['before', 1],
    ['after', 1],
    ['before', 2],
    ['after', 2],
    ['before', 3],
    ['after', 3],
  ] as const)(
    '선택한 문단의 %s 위치에 인용구 한 개를 넣고 검증한다',
    async (position, paragraphNumber) => {
      const { page, controlClick } = createQuotePage();
      const adapter = new NaverQuoteAdapter(page);

      await expect(
        adapter.insertDefaultQuote(
          [
            '첫 번째 문단입니다.',
            '두 번째 문단입니다.',
            '세 번째 문단입니다.',
          ],
          paragraphNumber,
          position,
        ),
      ).resolves.toEqual({
        stage: 'QUOTE_VERIFIED',
        message: '선택한 본문 문단 위치에 인용구를 넣고 결과를 확인했습니다.',
        currentUrl:
          'https://blog.naver.com/green_fork?Redirect=Write&categoryNo=1',
        paragraphNumber,
        position,
        quoteCount: 1,
      });
      expect(controlClick).toHaveBeenCalledOnce();
    },
  );

  it('이미지 뒤에 생긴 빈 문단은 위치 후보에서 제외한다', async () => {
    const { page } = createQuotePage({
      paragraphs: [
        '첫 번째 문단입니다.',
        '',
        '두 번째 문단입니다.',
        '세 번째 문단입니다.',
        '   ',
      ],
    });
    const adapter = new NaverQuoteAdapter(page);

    await expect(
      adapter.insertDefaultQuote(
        [
          '첫 번째 문단입니다.',
          '두 번째 문단입니다.',
          '세 번째 문단입니다.',
        ],
        3,
        'after',
      ),
    ).resolves.toMatchObject({
      stage: 'QUOTE_VERIFIED',
      paragraphNumber: 3,
      position: 'after',
    });
  });

  it('본문에 커서를 둔 뒤 나타나는 인용구 버튼을 사용한다', async () => {
    const { page, controlClick } = createQuotePage({
      controlLabel: '인용구 삽입',
      controlVisibleAfterCaret: true,
    });
    const adapter = new NaverQuoteAdapter(page);

    await expect(
      adapter.insertDefaultQuote(
        [
          '첫 번째 문단입니다.',
          '두 번째 문단입니다.',
          '세 번째 문단입니다.',
        ],
        2,
        'after',
      ),
    ).resolves.toMatchObject({
      stage: 'QUOTE_VERIFIED',
      paragraphNumber: 2,
      position: 'after',
    });
    expect(controlClick).toHaveBeenCalledOnce();
  });

  it('본문 문단이 원문과 다르면 버튼을 누르지 않는다', async () => {
    const { page, controlClick } = createQuotePage({
      paragraphs: ['변경된 문단입니다.'],
    });
    const adapter = new NaverQuoteAdapter(page);

    await expect(
      adapter.insertDefaultQuote(['원문 문단입니다.'], 1, 'after'),
    ).rejects.toMatchObject({
      code: 'QUOTE_ANCHOR_MISMATCH',
    });
    expect(controlClick).not.toHaveBeenCalled();
  });

  it('인용구 버튼이 여러 개면 임의로 선택하지 않는다', async () => {
    const { page, controlClick } = createQuotePage({
      controlCount: 2,
    });
    const adapter = new NaverQuoteAdapter(page);

    await expect(
      adapter.insertDefaultQuote(
        [
          '첫 번째 문단입니다.',
          '두 번째 문단입니다.',
          '세 번째 문단입니다.',
        ],
        1,
        'after',
      ),
    ).rejects.toMatchObject({
      code: 'QUOTE_CONTROL_AMBIGUOUS',
    });
    expect(controlClick).not.toHaveBeenCalled();
  });

  it('삽입 개수가 늘지 않으면 중복 재시도 없이 중단한다', async () => {
    const { page, controlClick } = createQuotePage({
      insertQuote: false,
    });
    const adapter = new NaverQuoteAdapter(page);

    await expect(
      adapter.insertDefaultQuote(
        [
          '첫 번째 문단입니다.',
          '두 번째 문단입니다.',
          '세 번째 문단입니다.',
        ],
        1,
        'after',
      ),
    ).rejects.toMatchObject({
      code: 'QUOTE_INSERT_UNCONFIRMED',
    });
    expect(controlClick).toHaveBeenCalledOnce();
  });

  it('삽입 위치가 선택과 다르면 성공으로 처리하지 않는다', async () => {
    const { page } = createQuotePage({
      verifyPosition: false,
    });
    const adapter = new NaverQuoteAdapter(page);

    await expect(
      adapter.insertDefaultQuote(
        [
          '첫 번째 문단입니다.',
          '두 번째 문단입니다.',
          '세 번째 문단입니다.',
        ],
        2,
        'before',
      ),
    ).rejects.toMatchObject({
      code: 'QUOTE_POSITION_MISMATCH',
      message:
        '2번째 문단의 요청 위치는 문단 앞, 실제 감지 위치는 문단 뒤입니다. 중복 삽입을 막기 위해 빈 새 글에서 다시 시작해 주세요.',
    });
  });
});

expect(NaverQuoteError).toBeDefined();

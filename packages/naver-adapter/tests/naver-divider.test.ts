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
  NaverDividerAdapter,
  NaverDividerError,
  type NaverDividerPosition,
  type NaverDividerStyleId,
  validateDividerRequest,
  validateDividerStyleSelection,
} from '../src/naver-divider.js';

interface DividerPageOptions {
  readonly abortAfterCaret?: AbortController;
  readonly abortAfterStyleMenu?: AbortController;
  readonly paragraphs?: readonly string[];
  readonly controlCount?: number;
  readonly controlLabel?: string;
  readonly controlVisibleAfterCaret?: boolean;
  readonly insertDivider?: boolean;
  readonly verifyPosition?: boolean;
  readonly styleIds?: readonly NaverDividerStyleId[];
  readonly styleMenuControlCount?: number;
  readonly insertedStyleOverride?: NaverDividerStyleId;
}

const allDividerStyleIds = [
  'default',
  'line1',
  'line2',
  'line3',
  'line4',
  'line5',
  'line6',
  'line7',
] as const;

function createCollection(locators: readonly Locator[]) {
  return {
    count: vi.fn().mockResolvedValue(locators.length),
    nth: vi.fn((index: number) => locators[index]),
  };
}

function createDividerPage(options: DividerPageOptions = {}): {
  readonly page: Page;
  readonly controlClick: ReturnType<typeof vi.fn>;
  readonly styleMenuClick: ReturnType<typeof vi.fn>;
  readonly styleOptionClicks: ReadonlyMap<
    NaverDividerStyleId,
    ReturnType<typeof vi.fn>
  >;
} {
  const paragraphTexts = options.paragraphs ?? [
    '첫 번째 문단입니다.',
    '두 번째 문단입니다.',
    '세 번째 문단입니다.',
  ];
  const controlCount = options.controlCount ?? 1;
  const styleIds = options.styleIds ?? allDividerStyleIds;
  const styleMenuControlCount = options.styleMenuControlCount ?? 1;
  const shouldInsert = options.insertDivider ?? true;
  const shouldVerifyPosition = options.verifyPosition ?? true;
  let dividerCount = 0;
  const dividerGaps: number[] = [];
  const insertedStyles: NaverDividerStyleId[] = [];
  let pendingParagraphIndex: number | null = null;
  let pendingPosition: NaverDividerPosition | null = null;
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
        before: dividerGaps.filter((gap) => gap <= paragraphIndex).length,
        after: dividerGaps.filter((gap) => gap > paragraphIndex).length,
      };
    }),
    innerText: vi.fn().mockResolvedValue(text),
    isVisible: vi.fn().mockResolvedValue(true),
  } as unknown as Locator));

  const insertAtPendingPosition = (
    requestedStyle: NaverDividerStyleId,
  ): void => {
    if (
      !shouldInsert ||
      pendingParagraphIndex === null ||
      !pendingPosition
    ) {
      return;
    }

    dividerCount += 1;
    insertedStyles.push(
      options.insertedStyleOverride ?? requestedStyle,
    );
    const insertedPosition = shouldVerifyPosition
      ? pendingPosition
      : pendingPosition === 'before'
        ? 'after'
        : 'before';
    dividerGaps.push(
      pendingParagraphIndex + (insertedPosition === 'after' ? 1 : 0),
    );
  };

  const controlClick = vi.fn(async () => {
    insertAtPendingPosition('default');
  });
  const mainControls = Array.from({ length: controlCount }, () => ({
    click: controlClick,
    evaluate: vi.fn().mockResolvedValue({
      label: options.controlLabel ?? '구분선',
      identity: 'se-toolbar-option-insert-horizontal-line-button',
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
        label: '구분선 선택',
        identity:
          'se-toolbar-select-button se-select-option-horizontal-line',
      }),
      isVisible: vi.fn().mockResolvedValue(true),
    } as unknown as Locator),
  );

  const styleOptionClicks = new Map<
    NaverDividerStyleId,
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
        label:
          '구분선 ' + (allDividerStyleIds.indexOf(styleId) + 1),
        identity:
          'se-toolbar-option-insert-horizontal-line-' +
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
          'se-toolbar-option-insert-horizontal-line-',
        )
      ) {
        return createCollection(styleOptions);
      }

      if (selector.includes('horizontalLine')) {
        return {
          count: vi.fn(async () => dividerCount),
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

describe('네이버 구분선 요청 검사', () => {
  it('문단 번호와 앞·뒤 위치를 검사한다', () => {
    expect(
      validateDividerRequest([' 첫 문단 ', '둘째 문단'], 2, 'after'),
    ).toEqual({
      expectedParagraphs: ['첫 문단', '둘째 문단'],
      paragraphNumber: 2,
      position: 'after',
    });

    expect(() =>
      validateDividerRequest(['첫 문단'], 2, 'after'),
    ).toThrowError(
      expect.objectContaining({ code: 'INVALID_DIVIDER_REQUEST' }),
    );
  });

  it('무작위와 8종 디자인 외의 값은 거부한다', () => {
    expect(validateDividerStyleSelection('random')).toBe('random');
    expect(validateDividerStyleSelection('line7')).toBe('line7');
    expect(() => validateDividerStyleSelection('line8')).toThrowError(
      expect.objectContaining({ code: 'INVALID_DIVIDER_REQUEST' }),
    );
  });
});

describe('네이버 구분선 디자인', () => {
  it('중단 신호를 받으면 디자인 선택창을 열지 않는다', async () => {
    const controller = new AbortController();
    const { page, styleMenuClick } = createDividerPage({
      abortAfterCaret: controller,
    });
    const adapter = new NaverDividerAdapter(page);

    await expect(adapter.listDividerStyles(
      [
        '첫 번째 문단입니다.',
        '두 번째 문단입니다.',
        '세 번째 문단입니다.',
      ],
      2,
      'after',
      controller.signal,
    )).rejects.toMatchObject({
      code: 'DIVIDER_OPERATION_INTERRUPTED',
    });

    expect(styleMenuClick).not.toHaveBeenCalled();
  });

  it('디자인 선택창을 연 뒤 중단되면 디자인을 클릭하지 않는다', async () => {
    const controller = new AbortController();
    const {
      page,
      styleMenuClick,
      styleOptionClicks,
    } = createDividerPage({
      abortAfterStyleMenu: controller,
    });
    const adapter = new NaverDividerAdapter(page);

    await expect(adapter.insertDivider(
      [
        '첫 번째 문단입니다.',
        '두 번째 문단입니다.',
        '세 번째 문단입니다.',
      ],
      1,
      'before',
      'line4',
      controller.signal,
    )).rejects.toMatchObject({
      code: 'DIVIDER_OPERATION_INTERRUPTED',
    });

    expect(styleMenuClick).toHaveBeenCalledOnce();
    expect(styleOptionClicks.get('line4')).not.toHaveBeenCalled();
  });

  it('현재 편집기에 표시된 8종 디자인을 순서대로 불러온다', async () => {
    const {
      page,
      controlClick,
      styleMenuClick,
    } = createDividerPage();
    const adapter = new NaverDividerAdapter(page);

    await expect(
      adapter.listDividerStyles(
        [
          '첫 번째 문단입니다.',
          '두 번째 문단입니다.',
          '세 번째 문단입니다.',
        ],
        2,
        'after',
      ),
    ).resolves.toEqual({
      stage: 'DIVIDER_STYLES_READY',
      message: '전용 Chrome에 표시된 구분선 디자인을 불러왔습니다.',
      currentUrl:
        'https://blog.naver.com/green_fork?Redirect=Write&categoryNo=1',
      paragraphNumber: 2,
      position: 'after',
      styles: allDividerStyleIds.map((id, index) => ({
        id,
        label: '구분선 ' + (index + 1),
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
    } = createDividerPage();
    const adapter = new NaverDividerAdapter(page);

    await expect(
      adapter.insertDivider(
        [
          '첫 번째 문단입니다.',
          '두 번째 문단입니다.',
          '세 번째 문단입니다.',
        ],
        1,
        'before',
        'line4',
      ),
    ).resolves.toMatchObject({
      stage: 'DIVIDER_VERIFIED',
      paragraphNumber: 1,
      position: 'before',
      dividerCount: 1,
      styleId: 'line4',
      styleLabel: '구분선 5',
    });
    expect(styleOptionClicks.get('line4')).toHaveBeenCalledOnce();
    expect(controlClick).not.toHaveBeenCalled();
  });

  it('무작위 선택은 현재 보이는 디자인 중 정확히 하나만 고른다', async () => {
    const {
      page,
      styleOptionClicks,
    } = createDividerPage();
    const adapter = new NaverDividerAdapter(page, () => 0.999_999);

    await expect(
      adapter.insertDivider(
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
      stage: 'DIVIDER_VERIFIED',
      styleId: 'line7',
      styleLabel: '구분선 8',
    });
    expect(styleOptionClicks.get('line7')).toHaveBeenCalledOnce();
  });

  it('선택한 디자인이 더 이상 보이지 않으면 삽입하지 않는다', async () => {
    const {
      page,
      controlClick,
    } = createDividerPage({
      styleIds: ['default', 'line1'],
    });
    const adapter = new NaverDividerAdapter(page);

    await expect(
      adapter.insertDivider(
        [
          '첫 번째 문단입니다.',
          '두 번째 문단입니다.',
          '세 번째 문단입니다.',
        ],
        1,
        'after',
        'line7',
      ),
    ).rejects.toMatchObject({
      code: 'DIVIDER_STYLE_STALE',
    });
    expect(controlClick).not.toHaveBeenCalled();
  });

  it('클릭 뒤 다른 디자인이 적용되면 성공으로 처리하지 않는다', async () => {
    const { page } = createDividerPage({
      insertedStyleOverride: 'line1',
    });
    const adapter = new NaverDividerAdapter(page);

    await expect(
      adapter.insertDivider(
        [
          '첫 번째 문단입니다.',
          '두 번째 문단입니다.',
          '세 번째 문단입니다.',
        ],
        2,
        'after',
        'line5',
      ),
    ).rejects.toMatchObject({
      code: 'DIVIDER_STYLE_MISMATCH',
    });
  });
});

describe('네이버 구분선 삽입', () => {
  it.each([
    ['before', 1],
    ['after', 1],
    ['before', 2],
    ['after', 2],
    ['before', 3],
    ['after', 3],
  ] as const)(
    '선택한 문단의 %s 위치에 구분선 한 개를 넣고 검증한다',
    async (position, paragraphNumber) => {
      const { page, controlClick } = createDividerPage();
      const adapter = new NaverDividerAdapter(page);

      await expect(
        adapter.insertDivider(
          [
            '첫 번째 문단입니다.',
            '두 번째 문단입니다.',
            '세 번째 문단입니다.',
          ],
          paragraphNumber,
          position,
        ),
      ).resolves.toEqual({
        stage: 'DIVIDER_VERIFIED',
        message: '선택한 본문 문단 위치에 구분선을 넣고 결과를 확인했습니다.',
        currentUrl:
          'https://blog.naver.com/green_fork?Redirect=Write&categoryNo=1',
        paragraphNumber,
        position,
        dividerCount: 1,
      });
      expect(controlClick).toHaveBeenCalledOnce();
    },
  );

  it('이미지 뒤에 생긴 빈 문단은 위치 후보에서 제외한다', async () => {
    const { page } = createDividerPage({
      paragraphs: [
        '첫 번째 문단입니다.',
        '',
        '두 번째 문단입니다.',
        '세 번째 문단입니다.',
        '   ',
      ],
    });
    const adapter = new NaverDividerAdapter(page);

    await expect(
      adapter.insertDivider(
        [
          '첫 번째 문단입니다.',
          '두 번째 문단입니다.',
          '세 번째 문단입니다.',
        ],
        3,
        'after',
      ),
    ).resolves.toMatchObject({
      stage: 'DIVIDER_VERIFIED',
      paragraphNumber: 3,
      position: 'after',
    });
  });

  it('본문에 커서를 둔 뒤 나타나는 구분선 버튼을 사용한다', async () => {
    const { page, controlClick } = createDividerPage({
      controlLabel: '구분선 삽입',
      controlVisibleAfterCaret: true,
    });
    const adapter = new NaverDividerAdapter(page);

    await expect(
      adapter.insertDivider(
        [
          '첫 번째 문단입니다.',
          '두 번째 문단입니다.',
          '세 번째 문단입니다.',
        ],
        2,
        'after',
      ),
    ).resolves.toMatchObject({
      stage: 'DIVIDER_VERIFIED',
      paragraphNumber: 2,
      position: 'after',
    });
    expect(controlClick).toHaveBeenCalledOnce();
  });

  it('본문 문단이 원문과 다르면 버튼을 누르지 않는다', async () => {
    const { page, controlClick } = createDividerPage({
      paragraphs: ['변경된 문단입니다.'],
    });
    const adapter = new NaverDividerAdapter(page);

    await expect(
      adapter.insertDivider(['원문 문단입니다.'], 1, 'after'),
    ).rejects.toMatchObject({
      code: 'DIVIDER_ANCHOR_MISMATCH',
    });
    expect(controlClick).not.toHaveBeenCalled();
  });

  it('구분선 버튼이 여러 개면 임의로 선택하지 않는다', async () => {
    const { page, controlClick } = createDividerPage({
      controlCount: 2,
    });
    const adapter = new NaverDividerAdapter(page);

    await expect(
      adapter.insertDivider(
        [
          '첫 번째 문단입니다.',
          '두 번째 문단입니다.',
          '세 번째 문단입니다.',
        ],
        1,
        'after',
      ),
    ).rejects.toMatchObject({
      code: 'DIVIDER_CONTROL_AMBIGUOUS',
    });
    expect(controlClick).not.toHaveBeenCalled();
  });

  it('삽입 개수가 늘지 않으면 중복 재시도 없이 중단한다', async () => {
    const { page, controlClick } = createDividerPage({
      insertDivider: false,
    });
    const adapter = new NaverDividerAdapter(page);

    await expect(
      adapter.insertDivider(
        [
          '첫 번째 문단입니다.',
          '두 번째 문단입니다.',
          '세 번째 문단입니다.',
        ],
        1,
        'after',
      ),
    ).rejects.toMatchObject({
      code: 'DIVIDER_INSERT_UNCONFIRMED',
    });
    expect(controlClick).toHaveBeenCalledOnce();
  });

  it('삽입 위치가 선택과 다르면 성공으로 처리하지 않는다', async () => {
    const { page } = createDividerPage({
      verifyPosition: false,
    });
    const adapter = new NaverDividerAdapter(page);

    await expect(
      adapter.insertDivider(
        [
          '첫 번째 문단입니다.',
          '두 번째 문단입니다.',
          '세 번째 문단입니다.',
        ],
        2,
        'before',
      ),
    ).rejects.toMatchObject({
      code: 'DIVIDER_POSITION_MISMATCH',
      message:
        '2번째 문단의 요청 위치는 문단 앞, 실제 감지 위치는 문단 뒤입니다. 중복 삽입을 막기 위해 빈 새 글에서 다시 시작해 주세요.',
    });
  });
});

expect(NaverDividerError).toBeDefined();
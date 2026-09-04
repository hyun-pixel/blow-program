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
  validateDividerRequest,
} from '../src/naver-divider.js';

interface DividerPageOptions {
  readonly paragraphs?: readonly string[];
  readonly controlCount?: number;
  readonly controlLabel?: string;
  readonly controlVisibleAfterCaret?: boolean;
  readonly insertDivider?: boolean;
  readonly verifyPosition?: boolean;
}

function createCollection(locators: readonly Locator[]) {
  return {
    count: vi.fn().mockResolvedValue(locators.length),
    nth: vi.fn((index: number) => locators[index]),
  };
}

function createDividerPage(options: DividerPageOptions = {}): {
  readonly page: Page;
  readonly controlClick: ReturnType<typeof vi.fn>;
} {
  const paragraphTexts = options.paragraphs ?? [
    '첫 번째 문단입니다.',
    '두 번째 문단입니다.',
    '세 번째 문단입니다.',
  ];
  const controlCount = options.controlCount ?? 1;
  const shouldInsert = options.insertDivider ?? true;
  const shouldVerifyPosition = options.verifyPosition ?? true;
  let dividerCount = 0;
  let beforeCount = 0;
  let afterCount = 0;
  let pendingPosition: NaverDividerPosition | null = null;

  const paragraphs = paragraphTexts.map((text) => ({
    click: vi.fn().mockResolvedValue(undefined),
    evaluate: vi.fn(async (
      _callback: unknown,
      argument: string,
    ) => {
      if (argument === 'before' || argument === 'after') {
        pendingPosition = argument;
        return undefined;
      }

      return {
        before: beforeCount,
        after: afterCount,
      };
    }),
    innerText: vi.fn().mockResolvedValue(text),
    isVisible: vi.fn().mockResolvedValue(true),
  } as unknown as Locator));

  const controlClick = vi.fn(async () => {
    if (!shouldInsert || !pendingPosition) {
      return;
    }

    dividerCount += 1;

    if (shouldVerifyPosition) {
      if (pendingPosition === 'before') {
        beforeCount += 1;
      } else {
        afterCount += 1;
      }
    } else if (pendingPosition === 'before') {
      afterCount += 1;
    } else {
      beforeCount += 1;
    }
  });
  const controls = Array.from({ length: controlCount }, () => ({
    click: controlClick,
    evaluate: vi.fn().mockResolvedValue({
      label: options.controlLabel ?? '구분선',
      identity: 'se-toolbar-option-insert-horizontal-line-button',
    }),
    isVisible: vi.fn(async () =>
      options.controlVisibleAfterCaret ? pendingPosition !== null : true,
    ),
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

      if (selector.includes('horizontalLine')) {
        return {
          count: vi.fn(async () => dividerCount),
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
    url: vi.fn().mockReturnValue(
      'https://blog.naver.com/green_fork?Redirect=Write&categoryNo=1',
    ),
    waitForTimeout: vi.fn().mockResolvedValue(undefined),
  } as unknown as Page;

  return { page, controlClick };
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
});

describe('네이버 구분선 삽입', () => {
  it.each([
    ['before', 1],
    ['after', 2],
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
    });
  });
});

expect(NaverDividerError).toBeDefined();
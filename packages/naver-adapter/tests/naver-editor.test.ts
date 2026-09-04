import type {
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
  NaverEditorAdapter,
  NaverEditorError,
  normalizeEditorParagraphs,
  normalizeEditorTitle,
  validateDraftContent,
} from '../src/naver-editor.js';

interface EditableMock {
  readonly locator: Locator;
  append(text: string): void;
  enter(): void;
  read(): string;
}

function createEditable(
  initialValue = '',
  editable = true,
  readTransform: (value: string) => string = (value) => value,
): EditableMock {
  let value = initialValue;
  const locator = {
    click: vi.fn().mockResolvedValue(undefined),
    evaluate: vi.fn(async () => readTransform(value)),
    fill: vi.fn(async (nextValue: string) => {
      value = nextValue;
    }),
    isEditable: vi.fn().mockResolvedValue(editable),
    isVisible: vi.fn().mockResolvedValue(true),
  } as unknown as Locator;

  return {
    locator,
    append: (text: string) => {
      value += text;
    },
    enter: () => {
      value += '\n';
    },
    read: () => value,
  };
}

function createCollection(locators: readonly Locator[]) {
  return {
    count: vi.fn().mockResolvedValue(locators.length),
    nth: vi.fn((index: number) => locators[index]),
  };
}

function createEditorPage(
  titleFields: readonly EditableMock[],
  bodyFields: readonly EditableMock[],
): Page {
  const emptyCollection = createCollection([]);
  let activeField: EditableMock | null = null;

  for (const field of [...titleFields, ...bodyFields]) {
    vi.mocked(field.locator.click).mockImplementation(async () => {
      activeField = field;
    });
  }

  return {
    keyboard: {
      insertText: vi.fn(async (text: string) => {
        activeField?.append(text);
      }),
      press: vi.fn(async (key: string) => {
        if (key === 'Enter') {
          activeField?.enter();
        }
      }),
    },
    frames: vi.fn().mockReturnValue([
      {
        locator: vi.fn((selector: string) => {
          if (selector.startsWith('.se-section-documentTitle')) {
            return createCollection(titleFields.map((field) => field.locator));
          }

          if (selector.startsWith('.se-section-text')) {
            return createCollection(bodyFields.map((field) => field.locator));
          }

          return emptyCollection;
        }),
      },
    ]),
    url: vi.fn().mockReturnValue(
      'https://blog.naver.com/green_fork?Redirect=Write&categoryNo=1',
    ),
    waitForTimeout: vi.fn().mockResolvedValue(undefined),
  } as unknown as Page;
}

describe('네이버 편집기 입력값 정규화', () => {
  it('줄바꿈과 네이버 편집기 공백 문자를 안정적으로 정리한다', () => {
    expect(normalizeEditorTitle('  테스트\r\n제목\u00a0')).toBe(
      '테스트 제목',
    );
    expect(
      normalizeEditorParagraphs('첫 문단\r\n\r\n\u200b둘째 문단\n'),
    ).toEqual(['첫 문단', '둘째 문단']);
  });

  it('제목과 본문의 빈 값과 길이 제한을 검사한다', () => {
    expect(() =>
      validateDraftContent({
        title: '',
        paragraphs: ['본문'],
      }),
    ).toThrowError(
      expect.objectContaining({ code: 'INVALID_DRAFT_CONTENT' }),
    );

    expect(() =>
      validateDraftContent({
        title: '제목',
        paragraphs: ['가'.repeat(10_001)],
      }),
    ).toThrowError(NaverEditorError);
  });
});

describe('네이버 편집기 제목·본문 입력', () => {
  it('빈 새 글에만 입력하고 편집기 결과를 다시 비교한다', async () => {
    const title = createEditable();
    const body = createEditable();
    const page = createEditorPage([title], [body]);
    const adapter = new NaverEditorAdapter(page);

    const result = await adapter.enterAndVerify({
      title: '[BLOW 입력 테스트] 제목 확인',
      paragraphs: [
        '첫 번째 문단입니다.',
        '한글·English·1234·🙂 입력을 확인합니다.',
      ],
    });

    expect(result).toEqual({
      stage: 'CONTENT_VERIFIED',
      message: '제목과 본문을 입력하고 원문과 일치하는지 확인했습니다.',
      currentUrl:
        'https://blog.naver.com/green_fork?Redirect=Write&categoryNo=1',
      titleLength: 19,
      bodyLength: 42,
      paragraphCount: 2,
    });
    expect(title.read()).toBe('[BLOW 입력 테스트] 제목 확인');
    expect(body.read()).toBe(
      '첫 번째 문단입니다.\n\n한글·English·1234·🙂 입력을 확인합니다.',
    );
  });

  it('contenteditable 입력 이벤트로 한글·이모지와 문단을 채운다', async () => {
    const title = createEditable();
    const body = createEditable();
    const page = createEditorPage([title], [body]);
    const adapter = new NaverEditorAdapter(page);

    await adapter.enterAndVerify({
      title: '한글 제목 🙂',
      paragraphs: [
        '첫 번째 본문입니다.',
        '한글 본문과 English 1234를 입력합니다.',
      ],
    });

    expect(title.locator.fill).toHaveBeenCalledWith('한글 제목 🙂');
    expect(body.locator.fill).toHaveBeenCalledWith(
      '첫 번째 본문입니다.\n\n한글 본문과 English 1234를 입력합니다.',
    );
    expect(page.keyboard.insertText).not.toHaveBeenCalled();
  });

  it('편집 속성이 없는 네이버 섹션은 클릭한 뒤 키 입력으로 채운다', async () => {
    const title = createEditable('', false);
    const body = createEditable('', false);
    const page = createEditorPage([title], [body]);
    const adapter = new NaverEditorAdapter(page);

    await adapter.enterAndVerify({
      title: '컨테이너 제목',
      paragraphs: ['첫 문단', '둘째 문단'],
    });

    expect(title.locator.click).toHaveBeenCalledOnce();
    expect(body.locator.click).toHaveBeenCalledOnce();
    expect(title.locator.fill).not.toHaveBeenCalled();
    expect(body.locator.fill).not.toHaveBeenCalled();
    expect(title.read()).toBe('컨테이너 제목');
    expect(body.read()).toBe('첫 문단\n\n둘째 문단');
    expect(page.keyboard.insertText).toHaveBeenCalledTimes(
      Array.from('컨테이너 제목첫 문단둘째 문단').length,
    );
    expect(page.waitForTimeout).toHaveBeenCalledWith(12);
    expect(page.waitForTimeout).toHaveBeenCalledWith(120);
  });

  it('네이버가 문단 줄바꿈을 글자값에서 생략해도 실제 문자가 같으면 성공한다', async () => {
    const title = createEditable();
    const body = createEditable('', false, (value) => value.replace(/\n/g, ''));
    const page = createEditorPage([title], [body]);
    const adapter = new NaverEditorAdapter(page);

    await expect(
      adapter.enterAndVerify({
        title: '줄바꿈 검증 제목',
        paragraphs: [
          '첫 문단입니다.',
          '둘째 문단입니다.',
          '셋째 문단입니다. 🙂',
        ],
      }),
    ).resolves.toMatchObject({
      stage: 'CONTENT_VERIFIED',
      paragraphCount: 3,
    });

    expect(body.read()).toBe(
      '첫 문단입니다.\n\n둘째 문단입니다.\n\n셋째 문단입니다. 🙂',
    );
  });
  it('기존 내용이 있으면 아무 글자도 입력하지 않고 중단한다', async () => {
    const title = createEditable('기존 제목');
    const body = createEditable();
    const page = createEditorPage([title], [body]);
    const adapter = new NaverEditorAdapter(page);

    await expect(
      adapter.enterAndVerify({
        title: '새 제목',
        paragraphs: ['새 본문'],
      }),
    ).rejects.toMatchObject({
      code: 'EDITOR_NOT_BLANK',
    });
    expect(title.locator.fill).not.toHaveBeenCalled();
    expect(body.locator.fill).not.toHaveBeenCalled();
    expect(page.keyboard.insertText).not.toHaveBeenCalled();
  });

  it('제목 입력 영역이 여러 개면 임의로 선택하지 않는다', async () => {
    const page = createEditorPage(
      [createEditable(), createEditable()],
      [createEditable()],
    );
    const adapter = new NaverEditorAdapter(page);

    await expect(
      adapter.enterAndVerify({
        title: '테스트 제목',
        paragraphs: ['테스트 본문'],
      }),
    ).rejects.toMatchObject({
      code: 'EDITOR_FIELD_AMBIGUOUS',
    });
  });
});
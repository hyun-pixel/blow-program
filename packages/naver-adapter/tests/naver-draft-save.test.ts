import type {
  Locator,
  Page,
  Response,
} from 'playwright-core';
import {
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import {
  NaverDraftSaveAdapter,
  NaverDraftSaveError,
} from '../src/naver-draft-save.js';

interface ControlSnapshot {
  readonly label: string;
  readonly identity?: string;
  readonly disabled?: boolean;
  readonly ariaDisabled?: boolean;
  readonly ariaBusy?: boolean;
  readonly state?: string;
}

interface ControlMock {
  readonly locator: Locator;
  readonly click: ReturnType<typeof vi.fn>;
}

function createControl(
  readSnapshot: () => ControlSnapshot,
  onClick?: () => void | Promise<void>,
  visible = true,
): ControlMock {
  const click = vi.fn(async () => {
    await onClick?.();
  });
  const locator = {
    click,
    evaluate: vi.fn(async () => {
      const snapshot = readSnapshot();
      return {
        label: snapshot.label,
        identity: snapshot.identity ?? '',
        disabled: snapshot.disabled ?? false,
        ariaDisabled: snapshot.ariaDisabled ?? false,
        ariaBusy: snapshot.ariaBusy ?? false,
        state: snapshot.state ?? '',
      };
    }),
    isVisible: vi.fn().mockResolvedValue(visible),
  } as unknown as Locator;

  return { locator, click };
}

function createCollection(locators: readonly Locator[]) {
  return {
    count: vi.fn().mockResolvedValue(locators.length),
    nth: vi.fn((index: number) => locators[index]),
  };
}

function createStatusCollection(readTexts: () => readonly string[]) {
  return {
    count: vi.fn(async () => readTexts().length),
    nth: vi.fn((index: number) => ({
      innerText: vi.fn(async () => readTexts()[index] ?? ''),
      isVisible: vi.fn(async () => Boolean(readTexts()[index])),
    })),
  };
}

function createResponse(
  url = 'https://blog.naver.com/PostWriteFormSe2TempSaveAsync.naver',
  status = 200,
  method = 'POST',
): Response {
  return {
    request: vi.fn().mockReturnValue({
      method: vi.fn().mockReturnValue(method),
    }),
    status: vi.fn().mockReturnValue(status),
    url: vi.fn().mockReturnValue(url),
  } as unknown as Response;
}

function createSavePage(
  controls: readonly ControlMock[],
  readStatusTexts: () => readonly string[],
): {
  readonly page: Page;
  emitResponse(response: Response): void;
  readonly off: ReturnType<typeof vi.fn>;
} {
  let responseListener: ((response: Response) => void) | null = null;
  const emptyCollection = createCollection([]);
  const off = vi.fn((
    event: string,
    listener: (response: Response) => void,
  ) => {
    if (event === 'response' && responseListener === listener) {
      responseListener = null;
    }
  });
  const page = {
    frames: vi.fn().mockReturnValue([
      {
        locator: vi.fn((selector: string) => {
          if (selector === 'button, [role="button"], a') {
            return createCollection(
              controls.map((control) => control.locator),
            );
          }

          if (selector.includes('[role="status"]')) {
            return createStatusCollection(readStatusTexts);
          }

          return emptyCollection;
        }),
      },
    ]),
    off,
    on: vi.fn((
      event: string,
      listener: (response: Response) => void,
    ) => {
      if (event === 'response') {
        responseListener = listener;
      }
    }),
    url: vi.fn().mockReturnValue(
      'https://blog.naver.com/green_fork?Redirect=Write&categoryNo=1',
    ),
    waitForTimeout: vi.fn().mockResolvedValue(undefined),
  } as unknown as Page;

  return {
    page,
    emitResponse: (response) => responseListener?.(response),
    off,
  };
}

describe('네이버 임시저장', () => {
  it('저장 버튼을 누르기 전에 작업이 중단되면 아무것도 누르지 않는다', async () => {
    const control = createControl(() => ({ label: '저장' }));
    const pageMock = createSavePage([control], () => []);
    const controller = new AbortController();
    controller.abort();

    await expect(
      new NaverDraftSaveAdapter(pageMock.page).saveAndVerify(
        controller.signal,
      ),
    ).rejects.toMatchObject({
      code: 'DRAFT_SAVE_OPERATION_INTERRUPTED',
    });
    expect(control.click).not.toHaveBeenCalled();
  });

  it('저장 버튼 조작이 시작된 뒤 중단 신호가 와도 실행 결과를 숨기지 않는다', async () => {
    const controller = new AbortController();
    const control = createControl(
      () => ({ label: '저장' }),
      () => controller.abort(),
    );
    const pageMock = createSavePage([control], () => []);

    await expect(
      new NaverDraftSaveAdapter(pageMock.page).saveAndVerify(
        controller.signal,
      ),
    ).resolves.toMatchObject({
      stage: 'DRAFT_SAVE_COMPLETED',
      signalCount: 1,
    });
    expect(control.click).toHaveBeenCalledOnce();
  });
  it('정확한 임시저장 버튼을 한 번만 누르고 서로 다른 완료 신호를 확인한다', async () => {
    let saved = false;
    let pageMock: ReturnType<typeof createSavePage>;
    const saveControl = createControl(
      () => ({ label: '저장' }),
      () => {
        saved = true;
        pageMock.emitResponse(createResponse());
      },
    );
    const draftListControl = createControl(
      () => ({ label: saved ? '임시저장 4' : '임시저장 3' }),
    );
    pageMock = createSavePage(
      [saveControl, draftListControl],
      () => saved ? ['임시저장이 완료되었습니다.'] : [],
    );

    const result = await new NaverDraftSaveAdapter(
      pageMock.page,
    ).saveAndVerify();

    expect(saveControl.click).toHaveBeenCalledOnce();
    expect(draftListControl.click).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      stage: 'DRAFT_SAVE_COMPLETED',
      signalCount: 4,
    });
    expect(result.signals.map((signal) => signal.id)).toEqual([
      'SAVE_RESPONSE_RECEIVED',
      'SAVE_CONTROL_CLICKED',
      'SAVED_COUNT_CHANGED',
      'COMPLETION_MESSAGE_SHOWN',
    ]);
    expect(pageMock.off).toHaveBeenCalledOnce();
  });

  it('임시저장 개수 변경 하나로 완료를 확인하고 다시 누르지 않는다', async () => {
    let clicked = false;
    let readsAfterClick = 0;
    const saveControl = createControl(() => {
      if (!clicked) {
        return { label: '저장' };
      }

      readsAfterClick += 1;

      if (readsAfterClick === 1) {
        return {
          label: '저장 중',
          disabled: true,
          state: 'saving',
        };
      }

      return { label: '저장' };
    }, () => {
      clicked = true;
    });
    const draftListControl = createControl(
      () => ({ label: clicked ? '임시저장 2' : '임시저장 1' }),
    );
    const pageMock = createSavePage(
      [saveControl, draftListControl],
      () => [],
    );

    const result = await new NaverDraftSaveAdapter(
      pageMock.page,
    ).saveAndVerify();

    expect(saveControl.click).toHaveBeenCalledOnce();
    expect(draftListControl.click).not.toHaveBeenCalled();
    expect(result.signals.map((signal) => signal.id)).toEqual([
      'SAVE_CONTROL_CLICKED',
      'SAVED_COUNT_CHANGED',
    ]);
  });

  it('저장 버튼 조작과 상태 변화만으로 실행 완료 처리한다', async () => {
    let clicked = false;
    let readsAfterClick = 0;
    const control = createControl(() => {
      if (!clicked) {
        return { label: '저장' };
      }

      readsAfterClick += 1;

      if (readsAfterClick === 1) {
        return {
          label: '저장 중',
          disabled: true,
          state: 'saving',
        };
      }

      return { label: '저장' };
    }, () => {
      clicked = true;
    });
    const pageMock = createSavePage([control], () => []);

    await expect(
      new NaverDraftSaveAdapter(pageMock.page).saveAndVerify(),
    ).resolves.toMatchObject({
      stage: 'DRAFT_SAVE_COMPLETED',
      signalCount: 2,
    });
    expect(control.click).toHaveBeenCalledOnce();
  });

  it('정확한 네이버 임시저장 응답 하나만으로 저장 완료를 확인한다', async () => {
    let pageMock: ReturnType<typeof createSavePage>;
    const control = createControl(
      () => ({ label: '저장' }),
      () => {
        pageMock.emitResponse(createResponse());
      },
    );
    pageMock = createSavePage([control], () => []);
    const adapter = new NaverDraftSaveAdapter(pageMock.page);

    await expect(adapter.saveAndVerify()).resolves.toMatchObject({
      stage: 'DRAFT_SAVE_COMPLETED',
      signalCount: 2,
    });
    expect(control.click).toHaveBeenCalledOnce();
    expect(pageMock.off).toHaveBeenCalledOnce();
  });

  it('임시저장과 무관한 편집기 응답은 처리 기록에 포함하지 않는다', async () => {
    let pageMock: ReturnType<typeof createSavePage>;
    const control = createControl(
      () => ({ label: '저장' }),
      () => {
        pageMock.emitResponse(
          createResponse('https://editor.naver.com/telemetry'),
        );
      },
    );
    pageMock = createSavePage([control], () => []);

    const result = await new NaverDraftSaveAdapter(
      pageMock.page,
    ).saveAndVerify();

    expect(result).toMatchObject({
      stage: 'DRAFT_SAVE_COMPLETED',
      signalCount: 1,
    });
    expect(result.signals.map((signal) => signal.id)).toEqual([
      'SAVE_CONTROL_CLICKED',
    ]);
    expect(control.click).toHaveBeenCalledOnce();
  });

  it('추가 완료 신호가 없어도 저장 버튼 조작이 끝나면 완료 처리한다', async () => {
    const control = createControl(() => ({ label: '저장' }));
    const pageMock = createSavePage([control], () => []);

    const result = await new NaverDraftSaveAdapter(
      pageMock.page,
    ).saveAndVerify();

    expect(result).toMatchObject({
      stage: 'DRAFT_SAVE_COMPLETED',
      signalCount: 1,
    });
    expect(result.signals.map((signal) => signal.id)).toEqual([
      'SAVE_CONTROL_CLICKED',
    ]);
    expect(control.click).toHaveBeenCalledOnce();
  });

  it('같은 우선순위의 임시저장 버튼이 여러 개면 아무것도 누르지 않는다', async () => {
    const first = createControl(() => ({ label: '저장' }));
    const second = createControl(() => ({ label: '저장' }));
    const pageMock = createSavePage([first, second], () => []);
    const adapter = new NaverDraftSaveAdapter(pageMock.page);

    await expect(adapter.saveAndVerify()).rejects.toMatchObject({
      code: 'DRAFT_SAVE_CONTROL_AMBIGUOUS',
    });
    expect(first.click).not.toHaveBeenCalled();
    expect(second.click).not.toHaveBeenCalled();
  });

  it('발행과 임시글 목록 버튼은 임시저장 후보로 사용하지 않는다', async () => {
    const publish = createControl(() => ({
      label: '발행',
      identity: 'publish save button',
    }));
    const draftList = createControl(() => ({
      label: '임시저장 목록 불러오기',
      identity: 'temporary-save-list',
    }));
    const pageMock = createSavePage([publish, draftList], () => []);
    const adapter = new NaverDraftSaveAdapter(pageMock.page);

    await expect(adapter.saveAndVerify()).rejects.toMatchObject({
      code: 'DRAFT_SAVE_CONTROL_NOT_FOUND',
    });
    expect(publish.click).not.toHaveBeenCalled();
    expect(draftList.click).not.toHaveBeenCalled();
  });

  it('버튼 조작 결과가 불확실하면 응답 감시를 정리하고 다시 누르지 않는다', async () => {
    const control = createControl(
      () => ({ label: '저장' }),
      () => {
        throw new Error('click interrupted');
      },
    );
    const pageMock = createSavePage([control], () => []);
    const adapter = new NaverDraftSaveAdapter(pageMock.page);

    await expect(adapter.saveAndVerify()).rejects.toMatchObject({
      name: NaverDraftSaveError.name,
      code: 'DRAFT_SAVE_CLICK_FAILED',
    });
    expect(control.click).toHaveBeenCalledOnce();
    expect(pageMock.off).toHaveBeenCalledOnce();
  });

  it('정확한 한글 버튼이 있으면 낮은 우선순위의 코드 후보는 누르지 않는다', async () => {
    let saved = false;
    let pageMock: ReturnType<typeof createSavePage>;
    const exact = createControl(
      () => ({ label: '저장' }),
      () => {
        saved = true;
        pageMock.emitResponse(createResponse());
      },
    );
    const identityOnly = createControl(() => ({
      label: '',
      identity: 'temporary-draft-save',
    }));
    const draftListControl = createControl(
      () => ({ label: saved ? '임시저장 2' : '임시저장 1' }),
    );
    pageMock = createSavePage(
      [exact, identityOnly, draftListControl],
      () => saved ? ['임시저장 완료'] : [],
    );

    await expect(
      new NaverDraftSaveAdapter(pageMock.page).saveAndVerify(),
    ).resolves.toMatchObject({ stage: 'DRAFT_SAVE_COMPLETED' });

    expect(exact.click).toHaveBeenCalledOnce();
    expect(identityOnly.click).not.toHaveBeenCalled();
  });
});
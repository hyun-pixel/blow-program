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
  beforeEach,
  afterEach,
} from 'vitest';
import {
  NaverDraftSaveAdapter,
  NaverDraftSaveError,
  readNaverDraftCount,
} from '../src/naver-draft-save.js';

beforeEach(() => vi.useFakeTimers({ toFake: ['performance'] }));
afterEach(() => vi.useRealTimers());

interface ControlSnapshot {
  readonly label: string;
  readonly identity?: string;
  readonly disabled?: boolean;
  readonly ariaDisabled?: boolean;
  readonly ariaBusy?: boolean;
  readonly state?: string;
  readonly aliases?: readonly string[];
  readonly nearSaveControl?: boolean;
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
      return [{
        label: snapshot.label,
        aliases: snapshot.aliases ?? [],
        nearSaveControl: snapshot.nearSaveControl ?? false,
        visible,
        identity: snapshot.identity ?? '',
        disabled: snapshot.disabled ?? false,
        ariaDisabled: snapshot.ariaDisabled ?? false,
        ariaBusy: snapshot.ariaBusy ?? false,
        state: snapshot.state ?? '',
      }];
    }),
    elementHandle: vi.fn(async () => locator),
    dispose: vi.fn().mockResolvedValue(undefined),
    isVisible: vi.fn().mockResolvedValue(visible),
  } as unknown as Locator;

  return { locator, click };
}

function createCollection(locators: readonly Locator[]) {
  return {
    count: vi.fn().mockResolvedValue(locators.length),
    nth: vi.fn((index: number) => locators[index]),
    evaluateAll: vi.fn(async () => (await Promise.all(locators.map(locator => locator.evaluate(() => [])))).flat()),
  };
}

function createStatusCollection(readTexts: () => readonly string[]) {
  return {
    count: vi.fn(async () => readTexts().length),
    evaluateAll: vi.fn(async () => readTexts()),
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
    waitForTimeout: vi.fn(async (ms: number) => { vi.advanceTimersByTime(ms); }),
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
    const pageMock = createSavePage([control], () => controller.signal.aborted ? ['임시저장이 완료되었습니다.'] : []);

    await expect(
      new NaverDraftSaveAdapter(pageMock.page).saveAndVerify(
        controller.signal,
      ),
    ).resolves.toMatchObject({
      stage: 'DRAFT_SAVE_COMPLETED',
      signalCount: 2,
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

  it('저장 버튼이 비활성화됐다 돌아온 것만으로는 완료 처리하지 않는다', async () => {
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
    ).rejects.toMatchObject({
      code: 'DRAFT_SAVE_UNCONFIRMED',
    });
    expect(control.click).toHaveBeenCalledOnce();
  });

  it('HTTP 200만으로는 저장 완료를 단정하지 않는다', async () => {
    let pageMock: ReturnType<typeof createSavePage>;
    const control = createControl(
      () => ({ label: '저장' }),
      () => {
        pageMock.emitResponse(createResponse());
      },
    );
    pageMock = createSavePage([control], () => []);
    const adapter = new NaverDraftSaveAdapter(pageMock.page);

    await expect(adapter.saveAndVerify()).rejects.toMatchObject({
      code: 'DRAFT_SAVE_UNCONFIRMED',
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

    await expect(new NaverDraftSaveAdapter(pageMock.page).saveAndVerify()).rejects.toMatchObject({ code: 'DRAFT_SAVE_UNCONFIRMED' });
    expect(control.click).toHaveBeenCalledOnce();
  });

  it('저장 버튼 클릭만 성공하고 완료 신호가 없으면 확인 필요로 처리한다', async () => {
    const control = createControl(() => ({ label: '저장' }));
    const pageMock = createSavePage([control], () => []);

    await expect(new NaverDraftSaveAdapter(pageMock.page).saveAndVerify()).rejects.toMatchObject({ code: 'DRAFT_SAVE_UNCONFIRMED' });
    expect(control.click).toHaveBeenCalledOnce();
  });

  it.each(['stale', 'failure', 'unsaved', 'count-decreased'])('완료가 아닌 상태를 성공으로 처리하지 않는다: %s', async scenario => {
    let clicked = false;
    const control = createControl(() => ({ label: '저장', state: clicked && scenario === 'unsaved' ? 'unsaved' : '' }), () => { clicked = true; });
    const count = createControl(() => ({ label: `임시저장 ${clicked && scenario === 'count-decreased' ? 2 : 3}` }));
    const pageMock = createSavePage([control, count], () => scenario === 'stale' ? ['임시저장 완료'] : clicked && scenario === 'failure' ? ['임시저장 완료 처리 중 오류가 발생했습니다.'] : []);
    await expect(new NaverDraftSaveAdapter(pageMock.page).saveAndVerify()).rejects.toMatchObject({ code: 'DRAFT_SAVE_UNCONFIRMED' });
    expect(control.click).toHaveBeenCalledOnce();
    expect(count.click).not.toHaveBeenCalled();
  });

  it('확인 중 사라진 광고 프레임은 건너뛰고 본문 프레임의 저장 완료를 확인한다', async () => {
    let clicked = false;
    const control = createControl(() => ({ label: '저장' }), () => { clicked = true; });
    const pageMock = createSavePage([control], () => clicked ? ['저장되었습니다.'] : []);
    const original = pageMock.page.frames();
    vi.mocked(pageMock.page.frames).mockReturnValue([
      { isDetached: () => true, locator: () => ({ evaluateAll: async () => { throw new Error('Frame was detached'); } }) } as unknown as ReturnType<Page['frames']>[number],
      ...original,
    ]);
    await expect(new NaverDraftSaveAdapter(pageMock.page).saveAndVerify()).resolves.toMatchObject({ stage: 'DRAFT_SAVE_COMPLETED' });
    expect(control.click).toHaveBeenCalledOnce();
  });

  it('프레임이 살아 있으면 버튼 탐색 오류를 숨기지 않는다', async () => {
    const control = createControl(() => ({ label: '저장' }));
    const pageMock = createSavePage([control], () => []);
    vi.mocked(pageMock.page.frames).mockReturnValue([
      { isDetached: () => false, locator: () => ({ evaluateAll: async () => { throw new Error('Live frame failure'); } }) } as unknown as ReturnType<Page['frames']>[number],
    ]);
    await expect(new NaverDraftSaveAdapter(pageMock.page).saveAndVerify()).rejects.toThrow('Live frame failure');
    expect(control.click).not.toHaveBeenCalled();
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

it.each([
  [{ label: '임시저장 3', identity: '' }, 3],
  [{ label: '저장 4', identity: '' }, 4],
  [{ label: '임시저장 목록', identity: 'save-count', aliases: ['5'], nearSaveControl: true }, 5],
  [{ label: '0', identity: 'save-count', nearSaveControl: true }, 0],
  [{ label: '임시저장(6)', identity: '' }, 6],
  [{ label: '5 임시저장 목록', identity: 'save-count' }, 5],
  [{ label: '저장 5 임시저장 목록', identity: 'save-count' }, 5],
  [{ label: '32', identity: 'font-size', nearSaveControl: false }, null],
  [{ label: '임시저장 3', identity: '', aliases: ['임시저장 4'] }, null],
] as const)('reads only an unambiguous draft count: %j', (snapshot, expected) => {
  expect(readNaverDraftCount(snapshot)).toBe(expected);
});

it('recognizes the separate numeric draft button without a toast or network response', async () => {
  let clicked = false;
  const control = createControl(() => ({ label: '저장' }), () => { clicked = true; });
  const count = createControl(() => ({ label: '임시저장 목록', aliases: [clicked ? '5' : '4'], nearSaveControl: true, identity: 'save-count' }));
  const mock = createSavePage([control, count], () => []);
  const result = await new NaverDraftSaveAdapter(mock.page).saveAndVerify();
  expect(result.signals.map(signal => signal.id)).toEqual(['SAVE_CONTROL_CLICKED', 'SAVED_COUNT_CHANGED']);
  expect(control.click).toHaveBeenCalledOnce();
  expect(count.click).not.toHaveBeenCalled();
});

it('measures elapsed time including slow browser reads, rather than 100 extra scans', async () => {
  let clicked = false;
  const control = createControl(() => {
    if (clicked) vi.advanceTimersByTime(2_000);
    return { label: '저장' };
  }, () => { clicked = true; });
  const mock = createSavePage([control], () => []);
  await expect(new NaverDraftSaveAdapter(mock.page).saveAndVerify()).rejects.toMatchObject({ code: 'DRAFT_SAVE_UNCONFIRMED' });
  expect(mock.page.waitForTimeout).toHaveBeenCalledTimes(2);
  expect(control.click).toHaveBeenCalledOnce();
});

it('rechecks the bound button before clicking so a changed index cannot publish', async () => {
  let reads = 0;
  const control = createControl(() => ({ label: ++reads === 1 ? '저장' : '발행' }));
  const mock = createSavePage([control], () => []);
  await expect(new NaverDraftSaveAdapter(mock.page).saveAndVerify()).rejects.toMatchObject({ code: 'DRAFT_SAVE_CONTROL_NOT_FOUND' });
  expect(control.click).not.toHaveBeenCalled();
});

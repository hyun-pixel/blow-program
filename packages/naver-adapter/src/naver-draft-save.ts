import type {
  Locator,
  Page,
  Response,
} from 'playwright-core';

const SAVE_OBSERVE_TIMEOUT_MS = 1_500;
const SAVE_VERIFY_INTERVAL_MS = 100;
const saveControlSelector = 'button, [role="button"], a';
const saveStatusSelector = [
  '[role="status"]',
  '[role="alert"]',
  '[aria-live="polite"]',
  '[aria-live="assertive"]',
  '[class*="toast"]',
  '[class*="Toast"]',
  '[class*="notice"]',
  '[class*="Notice"]',
].join(', ');

export type NaverDraftSaveFailureCode =
  | 'DRAFT_SAVE_CONTROL_NOT_FOUND'
  | 'DRAFT_SAVE_CONTROL_AMBIGUOUS'
  | 'DRAFT_SAVE_CLICK_FAILED'
  | 'DRAFT_SAVE_UNCONFIRMED'
  | 'DRAFT_SAVE_NAVIGATION_UNEXPECTED';

export type NaverDraftSaveSignalId =
  | 'SAVE_CONTROL_CLICKED'
  | 'SAVE_RESPONSE_RECEIVED'
  | 'COMPLETION_MESSAGE_SHOWN'
  | 'CONTROL_STATE_COMPLETED'
  | 'SAVED_COUNT_CHANGED'
  | 'SAVED_STATUS_CHANGED';

export interface NaverDraftSaveSignal {
  readonly id: NaverDraftSaveSignalId;
  readonly label: string;
}

export interface NaverDraftSaveResult {
  readonly stage: 'DRAFT_SAVE_COMPLETED';
  readonly message: string;
  readonly currentUrl: string;
  readonly signalCount: number;
  readonly signals: readonly NaverDraftSaveSignal[];
}

export class NaverDraftSaveError extends Error {
  constructor(
    readonly code: NaverDraftSaveFailureCode,
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = 'NaverDraftSaveError';
  }
}

interface SaveControlCandidate {
  readonly locator: Locator;
  readonly score: number;
}

interface SaveControlSnapshot {
  readonly label: string;
  readonly identity: string;
  readonly disabled: boolean;
  readonly ariaDisabled: boolean;
  readonly ariaBusy: boolean;
  readonly state: string;
}

function normalizeText(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

function compactText(value: string): string {
  return normalizeText(value).replace(/\s+/g, '');
}

async function readControlSnapshot(
  control: Locator,
): Promise<SaveControlSnapshot> {
  return control.evaluate((element) => {
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
      disabled:
        'disabled' in element &&
        Boolean((element as HTMLButtonElement).disabled),
      ariaDisabled: element.getAttribute('aria-disabled') === 'true',
      ariaBusy: element.getAttribute('aria-busy') === 'true',
      state: [
        element.getAttribute('data-state') ?? '',
        element.getAttribute('data-status') ?? '',
      ].join(' '),
    };
  });
}

function getSaveControlScore(snapshot: SaveControlSnapshot): number {
  const label = compactText(snapshot.label);
  const opensDraftList =
    label.startsWith('임시저장') ||
    (
      /(temporary|temp|draft)/i.test(snapshot.identity) &&
      /(list|layer|popup|count|load)/i.test(snapshot.identity)
    );
  const isUnsafeControl =
    opensDraftList ||
    /(불러오기|목록|삭제|취소|발행)/.test(label);

  if (isUnsafeControl) {
    return 0;
  }

  if (label === '저장') {
    return 5;
  }

  return 0;
}

async function findSaveControls(page: Page): Promise<readonly Locator[]> {
  const candidates: SaveControlCandidate[] = [];

  for (const frame of page.frames()) {
    const controls = frame.locator(saveControlSelector);
    const count = await controls.count();

    for (let index = 0; index < count; index += 1) {
      const control = controls.nth(index);
      const visible = await control.isVisible().catch(() => false);

      if (!visible) {
        continue;
      }

      const snapshot = await readControlSnapshot(control).catch(() => null);
      const score = snapshot ? getSaveControlScore(snapshot) : 0;

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

async function requireUniqueSaveControl(page: Page): Promise<Locator> {
  const controls = await findSaveControls(page);

  if (controls.length === 0) {
    throw new NaverDraftSaveError(
      'DRAFT_SAVE_CONTROL_NOT_FOUND',
      '네이버 편집기의 저장 버튼을 확인하지 못했습니다. Chrome 화면을 확인해 주세요.',
    );
  }

  if (controls.length > 1) {
    throw new NaverDraftSaveError(
      'DRAFT_SAVE_CONTROL_AMBIGUOUS',
      '저장 버튼이 여러 개 보여 안전을 위해 작업을 시작하지 않았습니다.',
    );
  }

  return controls[0]!;
}

async function readVisibleStatusTexts(page: Page): Promise<readonly string[]> {
  const texts = new Set<string>();

  for (const frame of page.frames()) {
    const statuses = frame.locator(saveStatusSelector);
    const count = await statuses.count();

    for (let index = 0; index < count; index += 1) {
      const status = statuses.nth(index);

      if (!(await status.isVisible().catch(() => false))) {
        continue;
      }

      const text = normalizeText(
        await status.innerText().catch(() => ''),
      );

      if (text) {
        texts.add(text);
      }
    }
  }

  return [...texts];
}

function isCompletionMessage(value: string): boolean {
  const text = compactText(value);
  return (
    /임시저장.*(완료|성공|저장됨|저장됐|저장되었)/.test(text) ||
    /(완료|성공|저장됨|저장됐|저장되었).*임시저장/.test(text)
  );
}

function hasSavedMetadata(value: string): boolean {
  const text = normalizeText(value);
  return (
    /임시\s*저장/.test(text) &&
    !isCompletionMessage(text) &&
    /(\d{1,2}:\d{2}|오전|오후|방금|저장됨)/.test(text)
  );
}

function readDraftCountFromSnapshot(
  snapshot: SaveControlSnapshot,
): number | null {
  const label = compactText(snapshot.label);
  const labeledCount = label.match(/^임시저장(?:글)?(\d+)(?:개)?$/);

  if (labeledCount) {
    return Number(labeledCount[1]);
  }

  if (
    /^\d+$/.test(label) &&
    /(temporary|temp|draft)/i.test(snapshot.identity) &&
    /(list|count)/i.test(snapshot.identity)
  ) {
    return Number(label);
  }

  return null;
}

async function readVisibleDraftCount(page: Page): Promise<number | null> {
  const counts = new Set<number>();

  for (const frame of page.frames()) {
    const controls = frame.locator(saveControlSelector);
    const count = await controls.count();

    for (let index = 0; index < count; index += 1) {
      const control = controls.nth(index);

      if (!(await control.isVisible().catch(() => false))) {
        continue;
      }

      const snapshot = await readControlSnapshot(control).catch(() => null);
      const draftCount = snapshot
        ? readDraftCountFromSnapshot(snapshot)
        : null;

      if (draftCount !== null) {
        counts.add(draftCount);
      }
    }
  }

  return counts.size === 1 ? [...counts][0]! : null;
}

function isBusyControl(snapshot: SaveControlSnapshot): boolean {
  return (
    snapshot.disabled ||
    snapshot.ariaDisabled ||
    snapshot.ariaBusy ||
    /(저장중|처리중)/.test(compactText(snapshot.label)) ||
    /(saving|loading|busy)/i.test(snapshot.state)
  );
}

function isCompletedControlState(
  before: SaveControlSnapshot,
  current: SaveControlSnapshot,
): boolean {
  const currentLabel = compactText(current.label);
  const completedLabel = /(저장완료|저장됨|저장됐|저장되었습니다)/.test(
    currentLabel,
  );
  const stateChanged = current.state !== before.state;
  const completedState = /(saved|complete|success)/i.test(current.state);

  return completedLabel || (stateChanged && completedState);
}

function isNaverEditorSaveResponse(response: Response): boolean {
  const status = response.status();

  if (status < 200 || status >= 300) {
    return false;
  }

  const method = response.request().method().toUpperCase();

  if (!['POST', 'PUT', 'PATCH'].includes(method)) {
    return false;
  }

  try {
    const url = new URL(response.url());
    const hostname = url.hostname.toLowerCase();
    const isNaverHost =
      hostname === 'blog.naver.com' ||
      hostname.endsWith('.blog.naver.com') ||
      (hostname.endsWith('.naver.com') && hostname.includes('editor'));

    if (!isNaverHost) {
      return false;
    }

    const endpoint = compactText(
      decodeURIComponent(url.pathname + url.search),
    );

    return /(?:tempsave|draftsave|autosave|postwrite.*(?:temp|save)|(?:temp|draft).*save)/i.test(
      endpoint,
    );
  } catch {
    return false;
  }
}

const signalLabels: Record<NaverDraftSaveSignalId, string> = {
  SAVE_CONTROL_CLICKED: '네이버 저장 버튼 조작 완료',
  SAVE_RESPONSE_RECEIVED: '네이버 임시저장 응답 수신',
  COMPLETION_MESSAGE_SHOWN: '임시저장 완료 안내 표시',
  CONTROL_STATE_COMPLETED: '네이버 저장 버튼 처리 완료',
  SAVED_COUNT_CHANGED: '임시저장 개수 변경',
  SAVED_STATUS_CHANGED: '임시저장 시각·상태 변경',
};

function toSignals(
  signalIds: ReadonlySet<NaverDraftSaveSignalId>,
): readonly NaverDraftSaveSignal[] {
  return [...signalIds].map((id) => ({ id, label: signalLabels[id] }));
}

function hasDirectCompletionSignal(
  signalIds: ReadonlySet<NaverDraftSaveSignalId>,
): boolean {
  const directSignalIds: readonly NaverDraftSaveSignalId[] = [
    'SAVE_RESPONSE_RECEIVED',
    'COMPLETION_MESSAGE_SHOWN',
    'SAVED_COUNT_CHANGED',
    'SAVED_STATUS_CHANGED',
  ];

  return directSignalIds.some((signalId) => signalIds.has(signalId));
}

export class NaverDraftSaveAdapter {
  constructor(private readonly page: Page) {}

  async saveAndVerify(): Promise<NaverDraftSaveResult> {
    const control = await requireUniqueSaveControl(this.page);
    const [beforeControl, beforeStatusTexts, beforeCount] = await Promise.all([
      readControlSnapshot(control),
      readVisibleStatusTexts(this.page),
      readVisibleDraftCount(this.page),
    ]);
    const beforeStatusSet = new Set(beforeStatusTexts);
    const signalIds = new Set<NaverDraftSaveSignalId>();
    let seenBusy = false;
    const onResponse = (response: Response): void => {
      if (isNaverEditorSaveResponse(response)) {
        signalIds.add('SAVE_RESPONSE_RECEIVED');
      }
    };

    this.page.on('response', onResponse);

    try {
      await control.click({ noWaitAfter: true });
    } catch (error) {
      this.page.off('response', onResponse);
      throw new NaverDraftSaveError(
        'DRAFT_SAVE_CLICK_FAILED',
        '저장 버튼 조작이 완료됐는지 확실하지 않아 자동으로 다시 누르지 않았습니다. Chrome에서 저장 여부를 확인해 주세요.',
        { cause: error },
      );
    }

    signalIds.add('SAVE_CONTROL_CLICKED');

    try {
      for (
        let elapsedMs = 0;
        elapsedMs <= SAVE_OBSERVE_TIMEOUT_MS;
        elapsedMs += SAVE_VERIFY_INTERVAL_MS
      ) {
        if (elapsedMs > 0) {
          await this.page.waitForTimeout(SAVE_VERIFY_INTERVAL_MS);
        }

        const [
          currentControl,
          currentStatusTexts,
          currentDraftCount,
        ] = await Promise.all([
          readControlSnapshot(control).catch(() => null),
          readVisibleStatusTexts(this.page).catch(() => []),
          readVisibleDraftCount(this.page).catch(() => null),
        ]);

        if (currentControl) {
          const busy = isBusyControl(currentControl);

          if (busy) {
            seenBusy = true;
          } else if (seenBusy) {
            signalIds.add('CONTROL_STATE_COMPLETED');
          }

          if (isCompletedControlState(beforeControl, currentControl)) {
            signalIds.add('CONTROL_STATE_COMPLETED');
          }

        }

        if (
          beforeCount !== null &&
          currentDraftCount !== null &&
          currentDraftCount !== beforeCount
        ) {
          signalIds.add('SAVED_COUNT_CHANGED');
        }

        for (const text of currentStatusTexts) {
          if (!beforeStatusSet.has(text) && isCompletionMessage(text)) {
            signalIds.add('COMPLETION_MESSAGE_SHOWN');
          }

          if (!beforeStatusSet.has(text) && hasSavedMetadata(text)) {
            signalIds.add('SAVED_STATUS_CHANGED');
          }
        }

        if (hasDirectCompletionSignal(signalIds) || signalIds.size >= 2) {
          break;
        }
      }
    } catch {
      // 보조 신호 수집 실패는 이미 완료된 버튼 조작을 무효화하지 않는다.
    } finally {
      this.page.off('response', onResponse);
    }


    const signals = toSignals(signalIds);

    return {
      stage: 'DRAFT_SAVE_COMPLETED',
      message: '네이버 저장 버튼을 한 번 조작해 임시저장을 실행했습니다.',
      currentUrl: this.page.url(),
      signalCount: signals.length,
      signals,
    };
  }
}
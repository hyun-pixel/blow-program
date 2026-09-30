import type {
  ElementHandle,
  Locator,
  Page,
  Response,
} from 'playwright-core';

const SAVE_OBSERVE_TIMEOUT_MS = 10_000;
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
  | 'DRAFT_SAVE_OPERATION_INTERRUPTED'
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

function throwIfDraftSaveInterrupted(signal?: AbortSignal): void {
  if (!signal?.aborted) {
    return;
  }

  throw new NaverDraftSaveError(
    'DRAFT_SAVE_OPERATION_INTERRUPTED',
    '사용자 조작을 감지해 임시저장을 시작하지 않았습니다.',
  );
}

interface SaveControlCandidate {
  readonly locator: Locator;
  readonly score: number;
}

interface SaveControlSnapshot {
  readonly label: string;
  readonly identity: string;
  readonly aliases?: readonly string[];
  readonly nearSaveControl?: boolean;
  readonly visible: boolean;
  readonly disabled: boolean;
  readonly ariaDisabled: boolean;
  readonly ariaBusy: boolean;
  readonly state: string;
}

function normalizeText(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

function compactText(value: string): string {
  return value.normalize('NFC').replace(/[\s\u200B-\u200D\uFEFF]/g, '');
}

// One browser round trip, with no per-element auto-wait during DOM replacement.
function captureSaveControls(input: Element | Element[]): SaveControlSnapshot[] {
  return (Array.isArray(input) ? input : [input]).map((element) => {
    const ariaLabel = element.getAttribute('aria-label') ?? '';
    const title = element.getAttribute('title') ?? '';
    const text = element.textContent ?? '';
    const aliases = [ariaLabel, title, text, (element as HTMLElement).innerText ?? ''].filter(Boolean);
    let nearSaveControl = false;
    if (aliases.some(label => /^\d+$/.test(label.replace(/\s+/g, '')))) {
      let container = element.parentElement;
      for (let depth = 0; container && depth < 2; depth++, container = container.parentElement) {
        nearSaveControl ||= Array.from(container.querySelectorAll('button, a, [role="button"]'))
          .some(candidate => candidate !== element &&
            (candidate.getAttribute('aria-label') || candidate.getAttribute('title') || candidate.textContent || '')
              .replace(/\s+/g, '') === '저장');
      }
    }
    const bounds = element.getBoundingClientRect();
    const style = element.ownerDocument.defaultView?.getComputedStyle(element);
    const identity = [
      element.id,
      element.className,
      element.getAttribute('data-name') ?? '',
      element.getAttribute('data-type') ?? '',
    ].join(' ');

    return {
      label: (ariaLabel || title || text).replace(/\s+/g, ' ').trim(),
      identity,
      aliases,
      nearSaveControl,
      visible: element.isConnected && bounds.width > 0 && bounds.height > 0 &&
        style?.visibility !== 'hidden' && style?.visibility !== 'collapse',
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

async function readControlSnapshot(control: ElementHandle<HTMLElement | SVGElement>): Promise<SaveControlSnapshot> {
  const snapshot = (await control.evaluate(captureSaveControls))[0];
  if (!snapshot?.visible) throw new Error('Save control is no longer visible');
  return snapshot;
}

function getSaveControlScore(snapshot: SaveControlSnapshot): number {
  const label = compactText(snapshot.label);
  const opensDraftList =
    label.startsWith('임시저장') ||
    readNaverDraftCount(snapshot) !== null ||
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
    const snapshots = await controls.evaluateAll(captureSaveControls).catch(error => {
      if (frame.isDetached()) return [];
      throw error;
    });

    for (const [index, snapshot] of snapshots.entries()) {
      const control = controls.nth(index);
      if (!snapshot.visible) {
        continue;
      }
      const score = getSaveControlScore(snapshot);

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

async function requireUniqueSaveControl(page: Page): Promise<ElementHandle<HTMLElement | SVGElement>> {
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

  const handle = await controls[0]!.elementHandle({ timeout: 1_000 });
  if (!handle) throw new NaverDraftSaveError('DRAFT_SAVE_CONTROL_NOT_FOUND', '저장 버튼이 사라져 실행하지 않았습니다. Chrome 화면을 확인해 주세요.');
  return handle;
}

async function readVisibleStatusTexts(page: Page): Promise<readonly string[]> {
  const texts = new Set<string>();

  for (const frame of page.frames()) {
    const statuses = frame.locator(saveStatusSelector);
    const snapshots = await statuses.evaluateAll(elements => elements.flatMap(element => {
      const bounds = element.getBoundingClientRect();
      const style = element.ownerDocument.defaultView?.getComputedStyle(element);
      if (!element.isConnected || bounds.width <= 0 || bounds.height <= 0 ||
          style?.visibility === 'hidden' || style?.visibility === 'collapse') return [];
      return [(element.textContent ?? '').replace(/\s+/g, ' ').trim()];
    })).catch(error => {
      if (frame.isDetached()) return [];
      throw error;
    });
    for (const text of snapshots) if (text) texts.add(text);
  }

  return [...texts];
}

function isCompletionMessage(value: string): boolean {
  const text = compactText(value);
  if (/(실패|오류|불가|취소|저장중)/.test(text)) return false;
  return (
    /^(?:글이)?(?:임시)?저장(?:이)?(?:완료되었습니다|되었습니다|됐습니다|완료|됨)[.!]?$/.test(text) ||
    /임시저장.*(완료|성공|저장됨|저장됐|저장되었)/.test(text) ||
    /(완료|성공|저장됨|저장됐|저장되었).*임시저장/.test(text)
  );
}

function hasSavedMetadata(value: string): boolean {
  const text = normalizeText(value);
  return (
    /임시\s*저장/.test(text) &&
    !/(실패|오류|불가|취소|저장중)/.test(compactText(text)) &&
    !isCompletionMessage(text) &&
    /(\d{1,2}:\d{2}|오전|오후|방금|저장됨)/.test(text)
  );
}

export function readNaverDraftCount(
  snapshot: { readonly label: string; readonly identity: string; readonly aliases?: readonly string[]; readonly nearSaveControl?: boolean },
): number | null {
  const counts = new Set<number>();
  for (const label of [snapshot.label, ...snapshot.aliases ?? []].map(compactText)) {
    const labeledCount = label.match(/^(?:임시)?저장(?:글)?(?:\((\d+)\)|(\d+))(?:개)?$/) ??
      label.match(/^(?:(?:임시)?저장(?:글)?)?(?:\((\d+)\)|(\d+))(?:개)?임시저장목록$/);
    const numericList = /^\d+$/.test(label) && (snapshot.nearSaveControl === true ||
      /(temporary|temp|draft)/i.test(snapshot.identity) && /(list|count)/i.test(snapshot.identity));
    const value = labeledCount ? Number(labeledCount[1] ?? labeledCount[2]) : numericList ? Number(label) : NaN;
    if (Number.isSafeInteger(value) && value >= 0) counts.add(value);
  }
  return counts.size === 1 ? [...counts][0]! : null;
}

async function readVisibleDraftCount(page: Page): Promise<number | null> {
  const counts = new Set<number>();

  for (const frame of page.frames()) {
    const controls = frame.locator(saveControlSelector);
    const snapshots = await controls.evaluateAll(captureSaveControls).catch(error => {
      if (frame.isDetached()) return [];
      throw error;
    });
    for (const snapshot of snapshots) {
      const draftCount = snapshot.visible ? readNaverDraftCount(snapshot) : null;

      if (draftCount !== null) {
        counts.add(draftCount);
      }
    }
  }

  return counts.size === 1 ? [...counts][0]! : null;
}

function isCompletedControlState(
  before: SaveControlSnapshot,
  current: SaveControlSnapshot,
): boolean {
  const currentLabel = compactText(current.label);
  const completedLabel = currentLabel !== compactText(before.label) && isCompletionMessage(currentLabel);
  const stateChanged = current.state !== before.state;
  const completedState = current.state.trim().split(/\s+/).some(state => /^(saved|complete|completed|success)$/i.test(state));

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
    'COMPLETION_MESSAGE_SHOWN',
    'SAVED_COUNT_CHANGED',
    'SAVED_STATUS_CHANGED',
  ];

  return directSignalIds.some((signalId) => signalIds.has(signalId));
}

export class NaverDraftSaveAdapter {
  constructor(private readonly page: Page) {}

  async saveAndVerify(signal?: AbortSignal): Promise<NaverDraftSaveResult> {
    throwIfDraftSaveInterrupted(signal);
    const control = await requireUniqueSaveControl(this.page);
    try {
      throwIfDraftSaveInterrupted(signal);
      const [beforeControl, beforeStatusTexts, beforeCount] = await Promise.all([
        readControlSnapshot(control),
        readVisibleStatusTexts(this.page),
        readVisibleDraftCount(this.page),
      ]);
      throwIfDraftSaveInterrupted(signal);
      if (getSaveControlScore(beforeControl) === 0) {
        throw new NaverDraftSaveError('DRAFT_SAVE_CONTROL_NOT_FOUND', '화면이 갱신되어 저장 버튼을 다시 확인할 수 없습니다. 다른 버튼은 누르지 않았습니다.');
      }
      const beforeStatusSet = new Set(beforeStatusTexts);
      let lastDraftCount = beforeCount;
      const signalIds = new Set<NaverDraftSaveSignalId>();
      const onResponse = (response: Response): void => {
        if (isNaverEditorSaveResponse(response)) {
          signalIds.add('SAVE_RESPONSE_RECEIVED');
        }
      };

      this.page.on('response', onResponse);

      try {
        throwIfDraftSaveInterrupted(signal);
        await control.click({ noWaitAfter: true, timeout: 5_000 });
      } catch (error) {
        this.page.off('response', onResponse);

        if (error instanceof NaverDraftSaveError) {
          throw error;
        }

        throw new NaverDraftSaveError(
          'DRAFT_SAVE_CLICK_FAILED',
          '저장 버튼 조작이 완료됐는지 확실하지 않아 자동으로 다시 누르지 않았습니다. Chrome에서 저장 여부를 확인해 주세요.',
          { cause: error },
        );
      }

      signalIds.add('SAVE_CONTROL_CLICKED');

      try {
        const deadline = performance.now() + SAVE_OBSERVE_TIMEOUT_MS;
        while (true) {
          const [
            currentControl,
            currentStatusTexts,
            currentDraftCount,
          ] = await Promise.all([
            readControlSnapshot(control).catch(() => null),
            readVisibleStatusTexts(this.page).catch(() => []),
            readVisibleDraftCount(this.page).catch(() => null),
          ]);
          lastDraftCount = currentDraftCount;

          if (currentControl) {
            if (isCompletedControlState(beforeControl, currentControl)) {
              signalIds.add('CONTROL_STATE_COMPLETED');
            }
          }

          if (
            beforeCount !== null &&
            currentDraftCount !== null &&
            currentDraftCount > beforeCount
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

          if (hasDirectCompletionSignal(signalIds) || signalIds.has('CONTROL_STATE_COMPLETED')) {
            break;
          }
          if (performance.now() >= deadline) break;
          await this.page.waitForTimeout(Math.max(0, Math.min(SAVE_VERIFY_INTERVAL_MS, deadline - performance.now())));
        }
      } catch {
        // Keep genuine completion evidence, but a click alone is never proof of saving.
      } finally {
        this.page.off('response', onResponse);
      }
      if (!hasDirectCompletionSignal(signalIds) && !signalIds.has('CONTROL_STATE_COMPLETED')) {
        throw new NaverDraftSaveError('DRAFT_SAVE_UNCONFIRMED',
          `저장 완료 신호를 확인하지 못했습니다. 임시저장 건수: 이전 ${beforeCount ?? '확인 불가'}, 마지막 ${lastDraftCount ?? '확인 불가'}. ` +
          '저장 버튼은 한 번만 눌렀습니다. 이미 저장됐을 수 있으므로 재생성하지 말고 Chrome의 임시저장 목록을 확인해 주세요.');
      }
      const signals = toSignals(signalIds);

      return {
        stage: 'DRAFT_SAVE_COMPLETED',
        message: '네이버 저장 버튼을 한 번 누른 뒤 임시저장 완료 신호를 확인했습니다.',
        currentUrl: this.page.url(),
        signalCount: signals.length,
        signals,
      };
    } finally {
      await control.dispose().catch(() => undefined);
    }
  }
}

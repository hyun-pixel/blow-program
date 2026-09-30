import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { prepareAutomationFocus } from './automation-focus.js';

const fixture = vi.hoisted(() => {
  const state = { focused: false, destroyed: false, minimized: false, canFocus: true };
  const listeners = new Map<string, Set<() => void>>();
  const window = {
    isFocused: () => state.focused, isDestroyed: () => state.destroyed, isMinimized: () => state.minimized,
    focus: vi.fn(() => { if (state.canFocus) setTimeout(() => { state.focused = true; }, 100); }),
    show: vi.fn(), once: vi.fn(), loadFile: vi.fn(), loadURL: vi.fn(),
    on: vi.fn((name: string, listener: () => void) => { if (!listeners.has(name)) listeners.set(name, new Set()); listeners.get(name)!.add(listener); }),
    off: vi.fn((name: string, listener: () => void) => { listeners.get(name)?.delete(listener); }),
    webContents: { setWindowOpenHandler: vi.fn(), on: vi.fn() },
  };
  const session = {
    profile: { blogId: 'example' }, close: vi.fn(),
    prepareAutomaticWriter: vi.fn(), enterContent: vi.fn(), listDividerStyles: vi.fn(), insertDivider: vi.fn(),
    listStickerCategories: vi.fn(), insertRandomSticker: vi.fn(), listQuoteStyles: vi.fn(), insertQuote: vi.fn(), saveDraft: vi.fn(),
  };
  return { state, window, listeners, session, start: null as null | (() => Promise<void>), handlers: new Map<string, (...args: any[]) => any>() };
});

vi.mock('electron', () => ({
  app: { setAppUserModelId: vi.fn(), requestSingleInstanceLock: () => true, on: vi.fn(), quit: vi.fn(), getPath: () => 'unused-test-path',
    whenReady: () => ({ then: (start: () => Promise<void>) => { fixture.start = start; } }) },
  BrowserWindow: Object.assign(function () { return fixture.window; }, { fromWebContents: () => fixture.window, getAllWindows: () => [fixture.window] }),
  ipcMain: { handle: (channel: string, handler: (...args: any[]) => any) => fixture.handlers.set(channel, handler) },
  dialog: {}, safeStorage: {}, screen: {},
}));
vi.mock('./generated-image-storage.js', () => ({ completePendingGeneratedImages: vi.fn(async () => {}), discardPendingGeneratedImages: vi.fn(async () => {}), pruneGeneratedImages: vi.fn(async () => {}) }));
vi.mock('./naver-connection.js', () => ({
  NaverConnectionSession: { create: async () => ({ session: fixture.session, status: { stage: 'WRITER_READY' } }) },
  NaverConnectionRunnerError: class extends Error {},
}));

const event = { senderFrame: { url: 'file:///test/index.html' }, sender: { isDestroyed: () => false, send: vi.fn() } };
const operations = [
  ['naver:enter-content', 'enterContent', { title: '테스트', paragraphs: ['본문입니다.'] }],
  ['naver:list-divider-styles', 'listDividerStyles'], ['naver:insert-divider', 'insertDivider'],
  ['naver:list-sticker-categories', 'listStickerCategories'], ['naver:insert-sticker', 'insertRandomSticker'],
  ['naver:list-quote-styles', 'listQuoteStyles'], ['naver:insert-quote', 'insertQuote'], ['naver:save-draft', 'saveDraft'],
] as const;
const location = { paragraphNumber: 1, position: 'after', categoryId: 'test-category' };
const invoke = (channel: string, input?: unknown) => fixture.handlers.get(channel)!(event, input);

beforeEach(async () => {
  vi.useFakeTimers(); vi.clearAllMocks();
  Object.assign(fixture.state, { focused: false, destroyed: false, minimized: false, canFocus: true });
  fixture.listeners.clear();
  fixture.window.focus.mockImplementation(() => { if (fixture.state.canFocus) setTimeout(() => { fixture.state.focused = true; }, 100); });
  for (const [, method] of operations) fixture.session[method].mockResolvedValue({ stage: 'TEST_COMPLETED' });
  vi.stubGlobal('__dirname', 'test-only');
  await import('./index.js');
  if (!fixture.handlers.size) await fixture.start!();
  await invoke('naver:open', 'https://blog.naver.com/example');
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

describe('automation focus preparation through real IPC handlers (no browser/network)', () => {
  it.each(operations)('%s waits for delayed focus before invoking the browser', async (channel, method, input?: unknown) => {
    const result = invoke(channel, input ?? location);
    await vi.advanceTimersByTimeAsync(250);
    expect(fixture.session[method]).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(2_500);
    expect((await result).ok).toBe(true);
    expect(fixture.session[method]).toHaveBeenCalledOnce();
    expect(fixture.window.focus).toHaveBeenCalledOnce();
    expect(fixture.listeners.get('blur')?.size).toBe(0);
  });

  it.each(operations)('%s still aborts on blur after the guard is armed', async (channel, method, input?: unknown) => {
    const result = invoke(channel, input ?? location);
    await vi.advanceTimersByTimeAsync(500);
    fixture.state.focused = false;
    for (const listener of fixture.listeners.get('blur') ?? []) listener();
    await vi.advanceTimersByTimeAsync(2_500);
    expect((await result).error.code).toBe('USER_INTERACTION_DETECTED');
    expect(fixture.session[method]).not.toHaveBeenCalled();
    expect(fixture.listeners.get('blur')?.size).toBe(0);
  });

  it('an in-flight input receives the abort signal and is not retried', async () => {
    let inputSignal: AbortSignal | undefined;
    fixture.session.enterContent.mockImplementation(async (_input, signal: AbortSignal) => {
      inputSignal = signal;
      await new Promise(resolve => setTimeout(resolve, 1_000));
      return { stage: 'EDITOR_INPUT_VERIFIED' };
    });
    const result = invoke('naver:enter-content', operations[0][2]);
    await vi.advanceTimersByTimeAsync(2_500);
    fixture.state.focused = false;
    for (const listener of fixture.listeners.get('blur') ?? []) listener();
    expect(inputSignal?.aborted).toBe(true);
    await vi.advanceTimersByTimeAsync(1_000);
    expect((await result).error.code).toBe('USER_INTERACTION_DETECTED');
    expect(fixture.session.enterContent).toHaveBeenCalledOnce();
  });

  it('refused focus causes no input and releases the busy lock', async () => {
    fixture.state.canFocus = false;
    const result = invoke('naver:enter-content', operations[0][2]);
    await vi.advanceTimersByTimeAsync(3_000);
    expect((await result).error.code).toBe('USER_INTERACTION_DETECTED');
    expect(fixture.session.enterContent).not.toHaveBeenCalled();
    fixture.state.canFocus = true;
    const retry = invoke('naver:enter-content', operations[0][2]);
    await vi.advanceTimersByTimeAsync(3_000);
    expect((await retry).ok).toBe(true);
  });

  it('writer preparation is not reported ready until focus returns', async () => {
    fixture.state.focused = true;
    fixture.session.prepareAutomaticWriter.mockImplementation(async () => { fixture.state.focused = false; return { stage: 'WRITER_READY' }; });
    const result = invoke('naver:prepare-automatic-writer', 'example');
    await vi.advanceTimersByTimeAsync(50);
    expect(fixture.state.focused).toBe(false);
    await vi.advanceTimersByTimeAsync(500);
    expect((await result).ok).toBe(true);
    expect(fixture.state.focused).toBe(true);
  });

  it('a refused focus change after opening a writer does not permit AI generation', async () => {
    fixture.state.focused = true; fixture.state.canFocus = false;
    fixture.session.prepareAutomaticWriter.mockImplementation(async () => { fixture.state.focused = false; return { stage: 'WRITER_READY' }; });
    const result = invoke('naver:prepare-automatic-writer', 'example');
    await vi.advanceTimersByTimeAsync(3_000);
    expect((await result).ok).toBe(false);
  });

  it('closed, missing and minimized windows cannot be readied', async () => {
    expect(await prepareAutomationFocus(null)).toBe(false);
    fixture.state.destroyed = true;
    expect(await prepareAutomationFocus(fixture.window)).toBe(false);
    fixture.state.destroyed = false; fixture.state.minimized = true;
    expect(await prepareAutomationFocus(fixture.window)).toBe(false);
    expect(fixture.window.focus).not.toHaveBeenCalled();
  });
});

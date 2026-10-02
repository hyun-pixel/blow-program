import { EventEmitter } from 'node:events';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { chromium, type BrowserContext, type Page } from 'playwright-core';
import { NaverConnectionAdapter, type NaverConnectionStatus } from '@blow/naver-adapter';
import { classifyNaverFailure, NaverConnectionSession } from './naver-connection.js';

vi.mock('playwright-core', () => ({ chromium: { launchPersistentContext: vi.fn() } }));
const status: NaverConnectionStatus = { stage: 'HOME_READY', registeredBlogId: 'example', currentUrl: 'https://section.blog.naver.com', message: 'ready' };
beforeEach(() => vi.restoreAllMocks());
async function fixture(closeWhileOpening = false) {
  const page = { close: vi.fn(), isClosed: () => false } as unknown as Page;
  const context = Object.assign(new EventEmitter(), {
    pages: () => [page], newPage: vi.fn(async () => page), close: vi.fn(async () => {}),
  });
  vi.mocked(chromium.launchPersistentContext).mockResolvedValue(context as unknown as BrowserContext);
  vi.spyOn(NaverConnectionAdapter.prototype, 'openHome').mockImplementation(async () => {
    if (closeWhileOpening) context.emit('close');
    return status;
  });
  const { session } = await NaverConnectionSession.create({ profilePath: join(tmpdir(), 'blow-mocked-profile'), blogUrl: 'https://blog.naver.com/example', headless: true });
  return { session, context, page };
}
describe('Naver connection lifecycle', () => {
  it('does not miss a disconnection while the first home page is opening', async () => {
    const { session } = await fixture(true);
    const lost = vi.fn();
    session.onDisconnected(lost);
    expect(session.isConnected()).toBe(false);
    expect(lost).toHaveBeenCalledOnce();
  });
  it('shares an in-flight login verification instead of navigating twice', async () => {
    const { session } = await fixture();
    let finish!: (value: NaverConnectionStatus) => void;
    const wait = vi.spyOn(NaverConnectionAdapter.prototype, 'waitForLoginAndVerify')
      .mockReturnValue(new Promise(resolve => { finish = resolve; }));
    const auto = session.waitForLoginAndVerify();
    const manual = session.verify();
    expect(wait).toHaveBeenCalledTimes(1);
    finish(status);
    await Promise.all([auto, manual]);
    wait.mockResolvedValue(status);
    await session.verify();
    expect(wait).toHaveBeenCalledTimes(2);
  });
  it('marks a disconnected context immediately and refuses a new tab', async () => {
    const { session, context } = await fixture();
    const lost = vi.fn(); session.onDisconnected(lost);
    context.emit('close');
    expect(session.isConnected()).toBe(false);
    expect(lost).toHaveBeenCalledTimes(1);
    await expect(session.prepareAutomaticWriter('example')).rejects.toMatchObject({ failure: { code: 'BROWSER_CLOSED' } });
    expect(context.newPage).not.toHaveBeenCalled();
  });
  it('detects a lost connection at newPage even before the close event arrives', async () => {
    const { session, context } = await fixture();
    context.newPage.mockRejectedValue(new Error('Target page, context or browser has been closed; private URL'));
    const lost = vi.fn(); session.onDisconnected(lost);
    await expect(session.prepareAutomaticWriter('example')).rejects.toMatchObject({ failure: { code: 'BROWSER_CLOSED', message: expect.stringContaining('새 탭 열기') } });
    expect(session.isConnected()).toBe(false);
    expect(lost).toHaveBeenCalledTimes(1);
    expect(context.close).not.toHaveBeenCalled();
  });
  it('keeps a required login tab open and makes it the target of re-verification', async () => {
    const { session, page } = await fixture();
    const verify = vi.spyOn(NaverConnectionAdapter.prototype, 'waitForLoginAndVerify').mockResolvedValue({ ...status, stage: 'LOGIN_REQUIRED' });
    const openWriter = vi.spyOn(NaverConnectionAdapter.prototype, 'openWriter');
    expect((await session.prepareAutomaticWriter('example')).stage).toBe('LOGIN_REQUIRED');
    const loginAdapter = verify.mock.instances[0];
    expect(page.close).not.toHaveBeenCalled();
    expect(openWriter).not.toHaveBeenCalled();
    await session.verify();
    expect(verify.mock.instances[1]).toBe(loginAdapter);
  });
  it('distinguishes a lost tab from a disconnected browser without leaking raw errors', () => {
    const error = new Error('Target page, context or browser has been closed; private URL');
    expect(classifyNaverFailure(error, true).code).toBe('NAVER_TAB_CLOSED');
    expect(classifyNaverFailure(error, false).code).toBe('BROWSER_CLOSED');
    expect(classifyNaverFailure(error, true).message).not.toContain('private URL');
  });
});

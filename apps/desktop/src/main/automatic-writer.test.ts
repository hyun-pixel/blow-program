import { afterEach, describe, expect, it, vi } from 'vitest';
import { NaverConnectionAdapter, NaverConnectionError } from '@blow/naver-adapter';
import type { BrowserContext } from 'playwright-core';
import { chromium } from 'playwright-core';
import { NaverConnectionSession } from './naver-connection.js';

afterEach(() => vi.restoreAllMocks());

describe('automatic writer prepares a fresh tab without touching existing drafts', () => {
  async function fixture() {
    const originalPage = { close: vi.fn() };
    const newPage = {
      close: vi.fn(),
      isClosed: vi.fn(() => false),
      url: vi.fn(() => 'https://section.blog.naver.com/BlogHome.naver'),
      context: vi.fn(),
    };
    const context = { once: vi.fn(), pages: () => [originalPage], newPage: vi.fn(async () => newPage), close: vi.fn(async () => {}) };
    newPage.context.mockReturnValue(context);
    vi.spyOn(chromium, 'launchPersistentContext').mockResolvedValue(context as unknown as BrowserContext);
    const base = { message: '', registeredBlogId: 'example', actualBlogId: 'example', currentUrl: 'https://blog.naver.com/example' };
    vi.spyOn(NaverConnectionAdapter.prototype, 'openHome').mockResolvedValue({ ...base, stage: 'HOME_READY' });
    const verify = vi.spyOn(NaverConnectionAdapter.prototype, 'verifyRegisteredBlog').mockResolvedValue({ ...base, stage: 'WRITER_LINK_READY', writerHref: 'https://blog.naver.com/example/postwrite' });
    const open = vi.spyOn(NaverConnectionAdapter.prototype, 'openWriter').mockResolvedValue({ ...base, stage: 'WRITER_READY' });
    const { session } = await NaverConnectionSession.create({ profilePath: '.', blogUrl: 'https://blog.naver.com/example', headless: true });
    return { session, context, originalPage, newPage, verify, open, base };
  }
  it('rejects the wrong blog before creating or navigating any tab', async () => {
    const f = await fixture();
    await expect(f.session.prepareAutomaticWriter('other')).rejects.toThrow('현재 연결이 다릅니다');
    expect(f.context.newPage).not.toHaveBeenCalled();
    expect(f.verify).not.toHaveBeenCalled();
  });
  it('rechecks the account and opens a new writer for each post', async () => {
    const f = await fixture();
    expect((await f.session.prepareAutomaticWriter('example')).stage).toBe('WRITER_READY');
    expect((await f.session.prepareAutomaticWriter('example')).stage).toBe('WRITER_READY');
    expect(f.context.newPage).toHaveBeenCalledTimes(2);
    expect(f.verify).toHaveBeenCalledTimes(2);
    expect(f.open).toHaveBeenCalledTimes(2);
    expect(f.originalPage.close).not.toHaveBeenCalled();
  });
  it.each(['LOGIN_REQUIRED', 'BLOG_MISMATCH'] as const)('does not open a writer on %s', async (stage) => {
    const f = await fixture();
    f.verify.mockResolvedValue({ ...f.base, stage });
    expect((await f.session.prepareAutomaticWriter('example')).stage).toBe(stage);
    expect(f.open).not.toHaveBeenCalled();
    expect(f.newPage.close).not.toHaveBeenCalled();
    expect(f.originalPage.close).not.toHaveBeenCalled();
  });
  it('recovers from a transient home navigation failure before opening the writer', async () => {
    const f = await fixture();
    f.verify.mockRejectedValueOnce(new Error(
      'Protocol error (Runtime.callFunctionOn): Cannot find context with specified id',
    ));
    expect((await f.session.prepareAutomaticWriter('example')).stage).toBe('WRITER_READY');
    expect(f.verify).toHaveBeenCalledTimes(2);
    expect(f.open).toHaveBeenCalledOnce();
    expect(f.context.newPage).toHaveBeenCalledOnce();
    expect(f.originalPage.close).not.toHaveBeenCalled();
  });
  it('does not switch to an existing draft if the new tab is closed', async () => {
    const f = await fixture();
    f.newPage.isClosed.mockReturnValue(true);
    f.verify.mockRejectedValue(new Error('Target page has been closed'));
    await expect(f.session.prepareAutomaticWriter('example')).rejects.toMatchObject({
      failure: { code: 'NAVER_TAB_CLOSED' },
    });
    expect(f.newPage.context).not.toHaveBeenCalled();
    expect(f.verify).not.toHaveBeenCalled();
    expect(f.open).not.toHaveBeenCalled();
  });
  it('never retries a safety rejection', async () => {
    const f = await fixture();
    f.verify.mockRejectedValue(new NaverConnectionError('WRITER_LINK_AMBIGUOUS', 'Ambiguous writer'));
    await expect(f.session.prepareAutomaticWriter('example')).rejects.toMatchObject({
      failure: { code: 'WRITER_LINK_AMBIGUOUS' },
    });
    expect(f.verify).toHaveBeenCalledOnce();
    expect(f.open).not.toHaveBeenCalled();
  });
  it('stops after five failed checks without opening a writer', async () => {
    const f = await fixture();
    f.verify.mockRejectedValue(new Error('Execution context was destroyed'));
    await expect(f.session.prepareAutomaticWriter('example')).rejects.toMatchObject({
      failure: { code: 'NAVER_CONNECTION_FAILED' },
    });
    expect(f.verify).toHaveBeenCalledTimes(5);
    expect(f.open).not.toHaveBeenCalled();
  }, 15_000);
  it('identifies a writer-opening failure without exposing raw browser details', async () => {
    const f = await fixture();
    f.open.mockRejectedValue(new Error('private-account-url-and-token'));
    await expect(f.session.prepareAutomaticWriter('example')).rejects.toMatchObject({
      failure: { code: 'NAVER_CONNECTION_FAILED', message: expect.stringContaining('자동 작성 준비: 글쓰기 화면 열기') },
    });
    try { await f.session.prepareAutomaticWriter('example'); } catch (error) {
      expect((error as Error).message).not.toContain('private-account-url-and-token');
    }
  });
});

import { afterEach, describe, expect, it, vi } from 'vitest';
import { NaverConnectionAdapter } from '@blow/naver-adapter';
import type { BrowserContext } from 'playwright-core';
import { chromium } from 'playwright-core';
import { NaverConnectionSession } from './naver-connection.js';

afterEach(() => vi.restoreAllMocks());

describe('automatic writer prepares a fresh tab without touching existing drafts', () => {
  async function fixture() {
    const originalPage = { close: vi.fn() };
    const newPage = { close: vi.fn() };
    const context = { pages: () => [originalPage], newPage: vi.fn(async () => newPage), close: vi.fn() };
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
    expect(f.newPage.close).toHaveBeenCalledTimes(1);
    expect(f.originalPage.close).not.toHaveBeenCalled();
  });
});

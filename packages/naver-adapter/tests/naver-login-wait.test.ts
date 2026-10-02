import type { Page } from 'playwright-core';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { NaverConnectionAdapter, parseNaverBlogUrl } from '../src/naver-connection.js';

const profile = parseNaverBlogUrl('https://blog.naver.com/example');
const home = 'https://section.blog.naver.com/BlogHome.naver';
const login = 'https://nid.naver.com/nidlogin.login';
const options = { timeoutMs: 1_000, pollIntervalMs: 10, settleDelayMs: 20 };
const ready = {
  stage: 'WRITER_LINK_READY' as const, message: 'ready', registeredBlogId: 'example',
  actualBlogId: 'example', currentUrl: home, writerHref: 'https://blog.naver.com/GoBlogWrite.naver',
};

afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers(); });

function fixture(initialUrl = home) {
  const state = { url: initialUrl, closed: false };
  const goto = vi.fn();
  const page = { url: () => state.url, isClosed: () => state.closed, goto } as unknown as Page;
  return { state, goto, adapter: new NaverConnectionAdapter(page) };
}

describe('로그인·보안 확인 화면 보존', () => {
  it('자동 확인 시작 직후 로그인으로 이동해도 사용자 화면을 덮어쓰지 않는다', async () => {
    vi.useFakeTimers();
    const { state, adapter } = fixture();
    const verify = vi.spyOn(adapter, 'verifyRegisteredBlog').mockResolvedValue(ready);
    const pending = adapter.waitForLoginAndVerify(profile, options);
    // The user clicks login during the initial settling delay.
    state.url = login;
    await vi.advanceTimersByTimeAsync(100);
    expect(verify).not.toHaveBeenCalled();
    state.url = home;
    await vi.advanceTimersByTimeAsync(100);
    await expect(pending).resolves.toEqual(ready);
    expect(verify).toHaveBeenCalledOnce();
  });

  it.each([login, 'https://nid.naver.com/login/ext/auth', 'https://nid.naver.com/user2/help/idSafetyRelease'])
    ('직접 연결 확인도 인증 화면에서 이동하지 않는다: %s', async url => {
      const { goto, adapter } = fixture(url);
      await expect(adapter.verifyRegisteredBlog(profile)).resolves.toMatchObject({ stage: 'LOGIN_REQUIRED' });
      expect(goto).not.toHaveBeenCalled();
    });

  it('글 작성 전 확인에서는 인증 중임을 즉시 반환하고 로그인 재시도를 하지 않는다', async () => {
    vi.useFakeTimers();
    const { adapter, goto } = fixture(login);
    const verify = vi.spyOn(adapter, 'verifyRegisteredBlog');
    let result: unknown;
    const pending = adapter.waitForLoginAndVerify(profile, { ...options, waitForLogin: false })
      .then(value => { result = value; }, error => { result = error; });
    await vi.advanceTimersByTimeAsync(100);
    expect(result).toMatchObject({ stage: 'LOGIN_REQUIRED' });
    expect(verify).not.toHaveBeenCalled();
    expect(goto).not.toHaveBeenCalled();
    await pending;
  });

  it('보안 확인 주소가 반복되어도 새로고침 없이 대기하고 시간 종료 시 안전하게 멈춘다', async () => {
    vi.useFakeTimers();
    const { state, adapter, goto } = fixture(login);
    const verify = vi.spyOn(adapter, 'verifyRegisteredBlog');
    const pending = adapter.waitForLoginAndVerify(profile, options).catch(error => error);
    for (let attempt = 0; attempt < 4; attempt += 1) {
      state.url = `${login}?challenge=${attempt}`;
      await vi.advanceTimersByTimeAsync(200);
    }
    await vi.advanceTimersByTimeAsync(300);
    expect(await pending).toMatchObject({ code: 'LOGIN_WAIT_TIMEOUT' });
    expect(verify).not.toHaveBeenCalled();
    expect(goto).not.toHaveBeenCalled();
  });
});

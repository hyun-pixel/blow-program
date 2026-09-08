import type { Frame, Page } from 'playwright-core';
import {
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import {
  getBlogIdFromNaverUrl,
  isNaverLoginUrl,
  isNaverWriterUrl,
  NaverConnectionAdapter,
  NaverConnectionError,
  normalizeUserInteractionType,
  normalizeWriterHref,
  parseNaverBlogUrl,
  selectUniqueWriterHref,
} from '../src/naver-connection.js';

describe('parseNaverBlogUrl', () => {
  it('일반 블로그 주소를 표준 주소로 변환한다', () => {
    expect(parseNaverBlogUrl('blog.naver.com/Brand_Blog')).toEqual({
      blogId: 'brand_blog',
      canonicalUrl: 'https://blog.naver.com/brand_blog',
    });
  });

  it('모바일 주소와 게시물 주소에서도 블로그 ID를 추출한다', () => {
    expect(
      parseNaverBlogUrl('https://m.blog.naver.com/Brand-Blog/123456'),
    ).toEqual({
      blogId: 'brand-blog',
      canonicalUrl: 'https://blog.naver.com/brand-blog',
    });

    expect(
      parseNaverBlogUrl(
        'https://blog.naver.com/PostView.naver?blogId=Brand.Blog&logNo=123',
      ),
    ).toEqual({
      blogId: 'brand.blog',
      canonicalUrl: 'https://blog.naver.com/brand.blog',
    });
  });

  it.each([
    '',
    'http://blog.naver.com/example',
    'https://example.com/blogid',
    'https://blog.naver.com/MyBlog.naver',
    'https://blog.naver.com/GoBlogWrite.naver',
    'javascript:alert(1)',
    'https://blog.naver.com/%ZZ',
  ])('허용하지 않는 주소를 거부한다: %s', (input) => {
    expect(() => parseNaverBlogUrl(input)).toThrow(NaverConnectionError);
  });
});

describe('네이버 현재 주소 판별', () => {
  it('로그인 주소와 실제 블로그 ID를 구분한다', () => {
    expect(
      isNaverLoginUrl(
        'https://nid.naver.com/nidlogin.login?url=https%3A%2F%2Fblog.naver.com',
      ),
    ).toBe(true);
    expect(isNaverLoginUrl('https://blog.naver.com/example')).toBe(false);
    expect(
      getBlogIdFromNaverUrl(
        'https://blog.naver.com/PostList.naver?blogId=Example',
      ),
    ).toBe('example');
    expect(getBlogIdFromNaverUrl('https://section.blog.naver.com/home')).toBe(
      null,
    );
  });
});

describe('자동 입력 전 인증 상태 확인', () => {
  const profile = {
    blogId: 'green_fork',
    canonicalUrl: 'https://blog.naver.com/green_fork',
  };
  const content = {
    title: '테스트 제목',
    paragraphs: ['테스트 본문'],
  };

  it.each([
    'https://nid.naver.com/nidlogin.login',
    'https://nid.naver.com/login/ext/auth',
  ])('인증 화면에서는 자동 입력을 시작하지 않는다: %s', async (url) => {
    const page = {
      url: vi.fn().mockReturnValue(url),
    } as unknown as Page;
    const adapter = new NaverConnectionAdapter(page);

    await expect(adapter.enterContent(profile, content)).rejects.toMatchObject({
      code: 'NAVER_AUTH_REQUIRED',
    });
    await expect(adapter.saveDraft(profile, content)).rejects.toMatchObject({
      code: 'NAVER_AUTH_REQUIRED',
    });
  });

  it('인증 화면이 아닌 다른 화면은 기존 글쓰기 화면 오류로 구분한다', async () => {
    const page = {
      url: vi.fn().mockReturnValue('https://blog.naver.com/green_fork'),
    } as unknown as Page;
    const adapter = new NaverConnectionAdapter(page);

    await expect(adapter.enterContent(profile, content)).rejects.toMatchObject({
      code: 'WRITER_NOT_READY',
    });
  });
});

describe('자동 입력 전 네트워크 상태 확인', () => {
  const profile = {
    blogId: 'green_fork',
    canonicalUrl: 'https://blog.naver.com/green_fork',
  };
  const content = {
    title: '테스트 제목',
    paragraphs: ['테스트 본문'],
  };

  it('오프라인 상태에서는 자동 입력과 임시저장을 시작하지 않는다', async () => {
    const page = {
      url: vi.fn().mockReturnValue(
        'https://blog.naver.com/green_fork?Redirect=Write&categoryNo=1',
      ),
      evaluate: vi.fn().mockResolvedValue(false),
    } as unknown as Page;
    const adapter = new NaverConnectionAdapter(page);

    await expect(adapter.enterContent(profile, content)).rejects.toMatchObject({
      code: 'NAVER_NETWORK_ERROR',
    });
    await expect(adapter.saveDraft(profile, content)).rejects.toMatchObject({
      code: 'NAVER_NETWORK_ERROR',
    });
    expect(page.evaluate).toHaveBeenCalledTimes(2);
  });

  it('온라인 상태는 사용 가능한 네트워크로 확인한다', async () => {
    const page = {
      evaluate: vi.fn().mockResolvedValue(true),
    } as unknown as Page;
    const adapter = new NaverConnectionAdapter(page);

    await expect(adapter.isNetworkAvailable()).resolves.toBe(true);
  });
});

describe('글쓰기 최종 주소 판별', () => {
  it('등록 블로그의 기존·신규 편집기 주소를 허용한다', () => {
    expect(
      isNaverWriterUrl(
        'https://blog.naver.com/PostWriteForm.naver?blogId=green_fork&Redirect=Write',
        'green_fork',
      ),
    ).toBe(true);
    expect(
      isNaverWriterUrl(
        'https://blog.naver.com/green_fork/postwrite',
        'green_fork',
      ),
    ).toBe(true);
    expect(
      isNaverWriterUrl(
        'https://blog.naver.com/green_fork?Redirect=Write&categoryNo=1',
        'green_fork',
      ),
    ).toBe(true);
  });

  it.each([
    'https://blog.naver.com/GoBlogWrite.naver',
    'https://blog.naver.com/PostWriteForm.naver?blogId=other_blog',
    'https://blog.naver.com/other_blog/postwrite',
    'https://blog.naver.com/green_fork',
    'https://blog.naver.com/green_fork?Redirect=View&categoryNo=1',
    'https://blog.naver.com/green_fork?Redirect=Write&categoryNo=invalid',
    'https://evil.example/PostWriteForm.naver?blogId=green_fork',
  ])('중간·외부·다른 블로그 주소를 거부한다: %s', (url) => {
    expect(isNaverWriterUrl(url, 'green_fork')).toBe(false);
  });
});

describe('글쓰기 이동 경로 제한', () => {
  it('허용된 글쓰기 주소만 정규화한다', () => {
    expect(
      normalizeWriterHref('https://blog.naver.com/GoBlogWrite.naver'),
    ).toBe('https://blog.naver.com/GoBlogWrite.naver');
    expect(normalizeWriterHref('/GoBlogWrite.naver')).toBe(
      'https://blog.naver.com/GoBlogWrite.naver',
    );
    expect(
      normalizeWriterHref('https://evil.example/GoBlogWrite.naver'),
    ).toBeNull();
    expect(
      normalizeWriterHref('https://blog.naver.com/PostWriteForm.naver'),
    ).toBeNull();
  });

  it('같은 목적지의 중복 링크는 하나의 안전한 경로로 처리한다', () => {
    expect(
      selectUniqueWriterHref([
        '/GoBlogWrite.naver',
        'https://blog.naver.com/GoBlogWrite.naver',
      ]),
    ).toBe('https://blog.naver.com/GoBlogWrite.naver');
  });

  it('허용된 글쓰기 링크가 없으면 중단한다', () => {
    expect(() =>
      selectUniqueWriterHref([
        'https://blog.naver.com/PostWriteForm.naver',
        'https://evil.example/GoBlogWrite.naver',
      ]),
    ).toThrowError(
      expect.objectContaining({
        code: 'WRITER_LINK_NOT_FOUND',
      }),
    );
  });
});

describe('사용자 Chrome 조작 감지', () => {
  it.each([
    ['pointerdown', 'pointer'],
    ['keydown', 'keyboard'],
    ['input', 'text-input'],
    ['wheel', 'scroll'],
  ] as const)('%s 이벤트를 안전한 분류값으로 변환한다', (eventType, expected) => {
    expect(normalizeUserInteractionType(eventType)).toBe(expected);
  });

  it('이벤트 내용 없이 사용자 조작 유형만 감지한다', async () => {
    let evaluateCall = 0;
    const frame = {
      evaluate: vi.fn().mockImplementation(async () => {
        evaluateCall += 1;
        return evaluateCall === 2 ? 'pointerdown' : undefined;
      }),
    } as unknown as Frame;
    const page = {
      bringToFront: vi.fn().mockResolvedValue(undefined),
      frames: vi.fn().mockReturnValue([frame]),
      isClosed: vi.fn().mockReturnValue(false),
    } as unknown as Page;
    const adapter = new NaverConnectionAdapter(page);

    await expect(adapter.waitForUserInteraction({
      timeoutMs: 500,
      pollIntervalMs: 25,
    })).resolves.toEqual({
      detected: true,
      interactionType: 'pointer',
      waitedMs: expect.any(Number),
    });
    expect(page.bringToFront).toHaveBeenCalledOnce();
    expect(frame.evaluate).toHaveBeenCalledTimes(3);
  });
});
describe('글쓰기 새 탭 진입', () => {
  it('새 탭으로 열린 편집기를 활성 화면으로 추적한다', async () => {
    const popupPage = {
      bringToFront: vi.fn().mockResolvedValue(undefined),
      url: vi.fn().mockReturnValue(
        'https://blog.naver.com/PostWriteForm.naver?blogId=green_fork',
      ),
      waitForURL: vi.fn().mockImplementation(
        async (predicate: (url: URL) => boolean) => {
          expect(
            predicate(new URL('https://blog.naver.com/GoBlogWrite.naver')),
          ).toBe(false);
          expect(
            predicate(
              new URL(
                'https://blog.naver.com/PostWriteForm.naver?blogId=green_fork',
              ),
            ),
          ).toBe(true);
        },
      ),
    } as unknown as Page;
    const writerLink = {
      click: vi.fn().mockResolvedValue(undefined),
      getAttribute: vi.fn().mockResolvedValue(
        'https://blog.naver.com/GoBlogWrite.naver',
      ),
      innerText: vi.fn().mockResolvedValue('글쓰기'),
      isVisible: vi.fn().mockResolvedValue(true),
    };
    const writerLinks = {
      count: vi.fn().mockResolvedValue(1),
      nth: vi.fn().mockReturnValue(writerLink),
    };
    const originPage = {
      frames: vi.fn().mockReturnValue([
        {
          locator: vi.fn().mockReturnValue(writerLinks),
        },
      ]),
      waitForEvent: vi.fn().mockResolvedValue(popupPage),
    } as unknown as Page;
    const adapter = new NaverConnectionAdapter(originPage);

    const status = await adapter.openWriter(
      {
        blogId: 'green_fork',
        canonicalUrl: 'https://blog.naver.com/green_fork',
      },
      'https://blog.naver.com/GoBlogWrite.naver',
    );

    expect(originPage.waitForEvent).toHaveBeenCalledWith(
      'popup',
      { timeout: 5_000 },
    );
    expect(writerLink.click).toHaveBeenCalledWith({ noWaitAfter: true });
    expect(popupPage.waitForURL).toHaveBeenCalledOnce();
    expect(status.stage).toBe('WRITER_READY');
    expect(status.currentUrl).toContain('/PostWriteForm.naver');

    await adapter.bringToFront();
    expect(popupPage.bringToFront).toHaveBeenCalledOnce();
  });
});
describe('로그인 완료 자동 확인', () => {
  it('하나의 탭에서 로그인 화면을 새로고침하지 않고 완료를 기다린다', async () => {
    let currentUrl = 'https://section.blog.naver.com/BlogHome.naver';
    let loggedIn = false;
    let myBlogAttempts = 0;
    const writerLink = {
      getAttribute: vi.fn().mockResolvedValue(
        'https://blog.naver.com/GoBlogWrite.naver',
      ),
      innerText: vi.fn().mockResolvedValue('글쓰기'),
      isVisible: vi.fn().mockResolvedValue(true),
    };
    const writerLinks = {
      count: vi.fn().mockResolvedValue(1),
      nth: vi.fn().mockReturnValue(writerLink),
    };
    const controls = {
      first: vi.fn().mockReturnValue({
        waitFor: vi.fn().mockResolvedValue(undefined),
      }),
    };
    const context = {
      newPage: vi.fn(),
    };
    const goto = vi.fn(async (url: string) => {
      if (url.includes('MyBlog.naver')) {
        myBlogAttempts += 1;
        currentUrl = loggedIn
          ? 'https://blog.naver.com/green_fork'
          : 'https://nid.naver.com/nidlogin.login';
        return;
      }

      currentUrl = url;
    });
    const page = {
      context: vi.fn().mockReturnValue(context),
      frames: vi.fn().mockReturnValue([
        {
          locator: vi.fn().mockReturnValue(writerLinks),
        },
      ]),
      goto,
      locator: vi.fn().mockReturnValue(controls),
      url: vi.fn(() => currentUrl),
    } as unknown as Page;
    const adapter = new NaverConnectionAdapter(page);

    setTimeout(() => {
      loggedIn = true;
      currentUrl = 'https://blog.naver.com/green_fork';
    }, 10);

    const status = await adapter.waitForLoginAndVerify(
      {
        blogId: 'green_fork',
        canonicalUrl: 'https://blog.naver.com/green_fork',
      },
      {
        timeoutMs: 100,
        pollIntervalMs: 1,
        settleDelayMs: 0,
      },
    );

    expect(status.stage).toBe('WRITER_LINK_READY');
    expect(status.actualBlogId).toBe('green_fork');
    expect(context.newPage).not.toHaveBeenCalled();
    expect(myBlogAttempts).toBe(2);
    expect(goto).toHaveBeenLastCalledWith(
      'https://section.blog.naver.com/BlogHome.naver?directoryNo=0&currentPage=1&groupId=0',
      {
        waitUntil: 'domcontentloaded',
        timeout: 30_000,
      },
    );
  });

  it('이미 로그인된 홈에서 확인 이동이 겹쳐도 다시 확인한다', async () => {
    const page = {
      isClosed: vi.fn().mockReturnValue(false),
      url: vi.fn().mockReturnValue(
        'https://section.blog.naver.com/BlogHome.naver',
      ),
    } as unknown as Page;
    const adapter = new NaverConnectionAdapter(page);
    const verify = vi
      .spyOn(adapter, 'verifyRegisteredBlog')
      .mockRejectedValueOnce(
        new NaverConnectionError(
          'NAVER_PAGE_UNKNOWN',
          '로그인 직후 이동 중입니다.',
        ),
      )
      .mockResolvedValueOnce({
        stage: 'WRITER_LINK_READY',
        message: '등록 블로그와 글쓰기 이동 경로를 확인했습니다.',
        registeredBlogId: 'green_fork',
        actualBlogId: 'green_fork',
        currentUrl: 'https://section.blog.naver.com/BlogHome.naver',
        writerHref: 'https://blog.naver.com/GoBlogWrite.naver',
      });

    const status = await adapter.waitForLoginAndVerify(
      {
        blogId: 'green_fork',
        canonicalUrl: 'https://blog.naver.com/green_fork',
      },
      {
        timeoutMs: 100,
        pollIntervalMs: 1,
        settleDelayMs: 0,
      },
    );

    expect(verify).toHaveBeenCalledTimes(2);
    expect(status.stage).toBe('WRITER_LINK_READY');
  });
});
describe('로그인 직후 이동 충돌 복구', () => {
  it('네이버의 마지막 이동과 검증 이동이 겹치면 자동으로 다시 확인한다', async () => {
    let currentUrl = 'https://nid.naver.com/nidlogin.login';
    let loginPage: Page;
    const context = {
      pages: vi.fn(() => [loginPage]),
    };
    loginPage = {
      context: vi.fn().mockReturnValue(context),
      isClosed: vi.fn().mockReturnValue(false),
      url: vi.fn(() => currentUrl),
    } as unknown as Page;
    const adapter = new NaverConnectionAdapter(loginPage);
    const verify = vi
      .spyOn(adapter, 'verifyRegisteredBlog')
      .mockRejectedValueOnce(
        new Error(
          'Protocol error (Runtime.callFunctionOn): Cannot find context with specified id',
        ),
      )
      .mockResolvedValueOnce({
        stage: 'WRITER_LINK_READY',
        message: '등록 블로그와 글쓰기 이동 경로를 확인했습니다.',
        registeredBlogId: 'green_fork',
        actualBlogId: 'green_fork',
        currentUrl: 'https://section.blog.naver.com/BlogHome.naver',
        writerHref: 'https://blog.naver.com/GoBlogWrite.naver',
      });

    setTimeout(() => {
      currentUrl = 'https://section.blog.naver.com/BlogHome.naver';
    }, 0);

    const status = await adapter.waitForLoginAndVerify(
      {
        blogId: 'green_fork',
        canonicalUrl: 'https://blog.naver.com/green_fork',
      },
      {
        timeoutMs: 100,
        pollIntervalMs: 1,
        settleDelayMs: 0,
      },
    );

    expect(verify).toHaveBeenCalledTimes(2);
    expect(status.stage).toBe('WRITER_LINK_READY');
  });
});
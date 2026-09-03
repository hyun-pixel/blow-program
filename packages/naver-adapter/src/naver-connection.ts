import type {
  Locator,
  Page,
} from 'playwright-core';

const BLOG_HOME_URL =
  'https://section.blog.naver.com/BlogHome.naver?directoryNo=0&currentPage=1&groupId=0';
const MY_BLOG_URL = 'https://blog.naver.com/MyBlog.naver';
const NAVER_BLOG_HOSTS = new Set(['blog.naver.com', 'm.blog.naver.com']);
const NAVER_LOGIN_HOST = 'nid.naver.com';
const BLOG_ID_PATTERN = /^[a-z0-9][a-z0-9._-]{1,49}$/i;
const RESERVED_PATHS = new Set([
  'BlogHome.naver',
  'GoBlogWrite.naver',
  'MyBlog.naver',
  'PostList.naver',
  'PostView.naver',
  'PostWriteForm.naver',
]);

export type NaverConnectionStage =
  | 'LOGIN_REQUIRED'
  | 'HOME_READY'
  | 'BLOG_MISMATCH'
  | 'WRITER_LINK_READY'
  | 'WRITER_READY';

export type NaverConnectionFailureCode =
  | 'INVALID_BLOG_URL'
  | 'LOGIN_WAIT_TIMEOUT'
  | 'NAVER_PAGE_UNKNOWN'
  | 'WRITER_LINK_NOT_FOUND'
  | 'WRITER_LINK_AMBIGUOUS'
  | 'WRITER_NOT_READY';

export interface NaverBlogProfile {
  readonly blogId: string;
  readonly canonicalUrl: string;
}

export interface LoginWaitOptions {
  readonly timeoutMs?: number;
  readonly pollIntervalMs?: number;
  readonly settleDelayMs?: number;
}

export interface NaverConnectionStatus {
  readonly stage: NaverConnectionStage;
  readonly message: string;
  readonly registeredBlogId: string;
  readonly actualBlogId?: string;
  readonly currentUrl: string;
  readonly writerHref?: string;
}

export class NaverConnectionError extends Error {
  constructor(
    readonly code: NaverConnectionFailureCode,
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = 'NaverConnectionError';
  }
}

function toUrl(input: string): URL {
  const trimmed = input.trim();

  if (!trimmed) {
    throw new NaverConnectionError(
      'INVALID_BLOG_URL',
      '네이버 블로그 주소를 입력해 주세요.',
    );
  }

  const normalized = /^https?:\/\//i.test(trimmed)
    ? trimmed
    : `https://${trimmed}`;

  try {
    return new URL(normalized);
  } catch (error) {
    throw new NaverConnectionError(
      'INVALID_BLOG_URL',
      '블로그 주소 형식을 확인해 주세요.',
      { cause: error },
    );
  }
}

function requireSafeBlogId(value: string | null): string {
  const blogId = value?.trim() ?? '';

  if (!BLOG_ID_PATTERN.test(blogId)) {
    throw new NaverConnectionError(
      'INVALID_BLOG_URL',
      '개별 네이버 블로그 주소를 입력해 주세요. 예: https://blog.naver.com/blogid',
    );
  }

  return blogId.toLowerCase();
}

function decodeFirstPath(pathname: string): string {
  const value = pathname.split('/').filter(Boolean)[0] ?? '';

  try {
    return decodeURIComponent(value);
  } catch (error) {
    throw new NaverConnectionError(
      'INVALID_BLOG_URL',
      '블로그 주소 형식을 확인해 주세요.',
      { cause: error },
    );
  }
}
export function parseNaverBlogUrl(input: string): NaverBlogProfile {
  const url = toUrl(input);
  const hostname = url.hostname.toLowerCase();

  if (url.protocol !== 'https:' || !NAVER_BLOG_HOSTS.has(hostname)) {
    throw new NaverConnectionError(
      'INVALID_BLOG_URL',
      'https://blog.naver.com으로 시작하는 주소만 사용할 수 있습니다.',
    );
  }

  const firstPath = decodeFirstPath(url.pathname);
  const queryBlogId = url.searchParams.get('blogId');
  const candidate = RESERVED_PATHS.has(firstPath) ? queryBlogId : firstPath;
  const blogId = requireSafeBlogId(candidate);

  return {
    blogId,
    canonicalUrl: `https://blog.naver.com/${blogId}`,
  };
}

export function getBlogIdFromNaverUrl(input: string): string | null {
  try {
    return parseNaverBlogUrl(input).blogId;
  } catch {
    return null;
  }
}

export function isNaverLoginUrl(input: string): boolean {
  try {
    const url = new URL(input);
    return (
      url.protocol === 'https:' &&
      url.hostname.toLowerCase() === NAVER_LOGIN_HOST
    );
  } catch {
    return false;
  }
}

function isTransientLoginNavigationError(error: unknown): boolean {
  const detail = error instanceof Error ? error.message : String(error);

  return /navigation.*interrupted|interrupted by another navigation|execution context was destroyed|frame was detached/i.test(
    detail,
  );
}

function waitForDelay(delayMs: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, delayMs);
  });
}

export function normalizeWriterHref(input: string): string | null {
  try {
    const url = new URL(input, 'https://blog.naver.com');

    if (
      url.protocol !== 'https:' ||
      url.hostname.toLowerCase() !== 'blog.naver.com' ||
      url.pathname !== '/GoBlogWrite.naver'
    ) {
      return null;
    }

    return 'https://blog.naver.com/GoBlogWrite.naver';
  } catch {
    return null;
  }
}

export function isNaverWriterUrl(
  input: string,
  expectedBlogId: string,
): boolean {
  try {
    const url = new URL(input);
    const hostname = url.hostname.toLowerCase();
    const normalizedBlogId = expectedBlogId.toLowerCase();

    if (url.protocol !== 'https:' || hostname !== 'blog.naver.com') {
      return false;
    }

    if (url.pathname === '/PostWriteForm.naver') {
      return url.searchParams.get('blogId')?.toLowerCase() === normalizedBlogId;
    }

    const segments = url.pathname.split('/').filter(Boolean);

    if (
      segments.length === 2 &&
      segments[0]?.toLowerCase() === normalizedBlogId &&
      segments[1]?.toLowerCase() === 'postwrite'
    ) {
      return true;
    }

    if (
      segments.length === 1 &&
      segments[0]?.toLowerCase() === normalizedBlogId
    ) {
      const queryEntries = [...url.searchParams.entries()];
      const redirectMode = queryEntries.find(
        ([key]) => key.toLowerCase() === 'redirect',
      )?.[1];
      const categoryNo = queryEntries.find(
        ([key]) => key.toLowerCase() === 'categoryno',
      )?.[1];

      return (
        redirectMode?.toLowerCase() === 'write' &&
        (categoryNo === undefined || /^\d{1,10}$/.test(categoryNo))
      );
    }

    return false;
  } catch {
    return false;
  }
}

export function selectUniqueWriterHref(
  hrefs: readonly string[],
): string {
  const targets = new Set(
    hrefs
      .map(normalizeWriterHref)
      .filter((href): href is string => href !== null),
  );

  if (targets.size === 0) {
    throw new NaverConnectionError(
      'WRITER_LINK_NOT_FOUND',
      '글쓰기 버튼을 확인할 수 없습니다. 네이버 로그인 상태를 확인해 주세요.',
    );
  }

  if (targets.size > 1) {
    throw new NaverConnectionError(
      'WRITER_LINK_AMBIGUOUS',
      '글쓰기 이동 경로를 하나로 확인할 수 없어 작업을 멈췄습니다.',
    );
  }

  return [...targets][0]!;
}

async function waitForHomeControls(page: Page): Promise<void> {
  await page
    .locator(
      'a[href*="GoBlogWrite.naver"], a[href*="nid.naver.com/nidlogin.login"]',
    )
    .first()
    .waitFor({
      state: 'attached',
      timeout: 5_000,
    })
    .catch(() => undefined);
}
async function hasVisibleLoginLink(page: Page): Promise<boolean> {
  for (const frame of page.frames()) {
    const links = frame.locator('a[href*="nid.naver.com/nidlogin.login"]');
    const count = await links.count();

    for (let index = 0; index < count; index += 1) {
      if (await links.nth(index).isVisible().catch(() => false)) {
        return true;
      }
    }
  }

  return false;
}

interface WriterCandidate {
  readonly locator: Locator;
  readonly href: string;
}

async function getWriterCandidates(page: Page): Promise<WriterCandidate[]> {
  const candidates: WriterCandidate[] = [];

  for (const frame of page.frames()) {
    const links = frame.locator('a[href*="GoBlogWrite.naver"]');
    const count = await links.count();

    for (let index = 0; index < count; index += 1) {
      const locator = links.nth(index);
      const [visible, href, label] = await Promise.all([
        locator.isVisible().catch(() => false),
        locator.getAttribute('href'),
        locator.innerText().catch(() => ''),
      ]);
      const normalizedHref = href ? normalizeWriterHref(href) : null;

      if (visible && normalizedHref && label.trim() === '글쓰기') {
        candidates.push({ locator, href: normalizedHref });
      }
    }
  }

  return candidates;
}

export class NaverConnectionAdapter {
  private verificationPage?: Page;

  constructor(private page: Page) {}

  private async getVerificationPage(): Promise<Page> {
    if (this.verificationPage && !this.verificationPage.isClosed()) {
      return this.verificationPage;
    }

    const context = this.page.context();
    const focusPage = context.pages().find(
      (page) => !page.isClosed() && isNaverLoginUrl(page.url()),
    ) ?? this.page;
    this.verificationPage = await context.newPage();
    await focusPage.bringToFront().catch(() => undefined);

    return this.verificationPage;
  }

  async openHome(profile: NaverBlogProfile): Promise<NaverConnectionStatus> {
    await this.page.goto(BLOG_HOME_URL, {
      waitUntil: 'domcontentloaded',
      timeout: 30_000,
    });
    await waitForHomeControls(this.page);


    if (
      isNaverLoginUrl(this.page.url()) ||
      (await hasVisibleLoginLink(this.page))
    ) {
      return {
        stage: 'LOGIN_REQUIRED',
        message: '전용 Chrome에서 로그인을 완료하면 BLOW가 자동으로 블로그를 확인합니다.',
        registeredBlogId: profile.blogId,
        currentUrl: this.page.url(),
      };
    }

    return {
      stage: 'HOME_READY',
      message: '네이버 블로그 홈을 열었습니다. 등록 블로그 연결을 확인할 수 있습니다.',
      registeredBlogId: profile.blogId,
      currentUrl: this.page.url(),
    };
  }

  async waitForLoginAndVerify(
    profile: NaverBlogProfile,
    options: LoginWaitOptions = {},
  ): Promise<NaverConnectionStatus> {
    const timeoutMs = options.timeoutMs ?? 600_000;
    const pollIntervalMs = options.pollIntervalMs ?? 1_500;
    const settleDelayMs = options.settleDelayMs ?? 1_200;
    const deadline = Date.now() + timeoutMs;

    await waitForDelay(settleDelayMs);

    while (Date.now() < deadline) {
      try {
        const status = await this.verifyRegisteredBlog(profile);

        if (status.stage !== 'LOGIN_REQUIRED') {
          return status;
        }
      } catch (error) {
        if (!isTransientLoginNavigationError(error)) {
          throw error;
        }
      }

      await waitForDelay(pollIntervalMs);
    }

    throw new NaverConnectionError(
      'LOGIN_WAIT_TIMEOUT',
      '로그인 자동 확인 시간이 지났습니다. 로그인 상태를 확인한 뒤 다시 시도해 주세요.',
    );
  }

  async verifyRegisteredBlog(
    profile: NaverBlogProfile,
  ): Promise<NaverConnectionStatus> {
    const verificationPage = await this.getVerificationPage();

    await verificationPage.goto(MY_BLOG_URL, {
      waitUntil: 'domcontentloaded',
      timeout: 30_000,
    });

    if (isNaverLoginUrl(verificationPage.url())) {
      return {
        stage: 'LOGIN_REQUIRED',
        message: '네이버 로그인 완료를 기다리고 있습니다. 완료되면 BLOW가 자동으로 확인합니다.',
        registeredBlogId: profile.blogId,
        currentUrl: verificationPage.url(),
      };
    }

    const actualBlogId = getBlogIdFromNaverUrl(verificationPage.url());

    if (!actualBlogId) {
      throw new NaverConnectionError(
        'NAVER_PAGE_UNKNOWN',
        '로그인된 블로그 주소를 확인할 수 없어 작업을 멈췄습니다.',
      );
    }

    if (actualBlogId !== profile.blogId) {
      this.page = verificationPage;

      return {
        stage: 'BLOG_MISMATCH',
        message: '로그인된 블로그와 입력한 주소가 다릅니다. 주소 또는 로그인 계정을 확인해 주세요.',
        registeredBlogId: profile.blogId,
        actualBlogId,
        currentUrl: verificationPage.url(),
      };
    }

    await verificationPage.goto(BLOG_HOME_URL, {
      waitUntil: 'domcontentloaded',
      timeout: 30_000,
    });
    await waitForHomeControls(verificationPage);

    const candidates = await getWriterCandidates(verificationPage);
    const writerHref = selectUniqueWriterHref(
      candidates.map((candidate) => candidate.href),
    );
    this.page = verificationPage;

    return {
      stage: 'WRITER_LINK_READY',
      message: '등록 블로그와 글쓰기 이동 경로를 확인했습니다.',
      registeredBlogId: profile.blogId,
      actualBlogId,
      currentUrl: verificationPage.url(),
      writerHref,
    };
  }
  async openWriter(
    profile: NaverBlogProfile,
    expectedWriterHref: string,
  ): Promise<NaverConnectionStatus> {
    const safeWriterHref = normalizeWriterHref(expectedWriterHref);

    if (!safeWriterHref) {
      throw new NaverConnectionError(
        'WRITER_NOT_READY',
        '확인된 글쓰기 이동 경로가 없어 작업을 시작할 수 없습니다.',
      );
    }

    const candidates = await getWriterCandidates(this.page);
    const targets = candidates.filter(
      (candidate) => candidate.href === safeWriterHref,
    );
    const uniqueHref = selectUniqueWriterHref(
      targets.map((candidate) => candidate.href),
    );
    const target = targets[0];

    if (!target || uniqueHref !== safeWriterHref) {
      throw new NaverConnectionError(
        'WRITER_NOT_READY',
        '글쓰기 버튼 상태가 바뀌어 작업을 멈췄습니다.',
      );
    }

    const originPage = this.page;
    const popupPromise = originPage
      .waitForEvent('popup', { timeout: 5_000 })
      .catch(() => null);

    await target.locator.click({ noWaitAfter: true });

    const popupPage = await popupPromise;
    this.page = popupPage ?? originPage;

    try {
      await this.page.waitForURL(
        (url) => (
          isNaverLoginUrl(url.toString()) ||
          isNaverWriterUrl(url.toString(), profile.blogId)
        ),
        {
          waitUntil: 'domcontentloaded',
          timeout: 30_000,
        },
      );
    } catch (error) {
      throw new NaverConnectionError(
        'WRITER_NOT_READY',
        '네이버 글쓰기 화면의 최종 주소를 확인하지 못해 작업을 멈췄습니다.',
        { cause: error },
      );
    }

    if (isNaverLoginUrl(this.page.url())) {
      return {
        stage: 'LOGIN_REQUIRED',
        message: '로그인이 만료되었습니다. Chrome에서 다시 로그인해 주세요.',
        registeredBlogId: profile.blogId,
        currentUrl: this.page.url(),
      };
    }

    if (!isNaverWriterUrl(this.page.url(), profile.blogId)) {
      throw new NaverConnectionError(
        'WRITER_NOT_READY',
        '네이버 글쓰기 화면을 확실히 확인할 수 없어 작업을 멈췄습니다.',
      );
    }

    return {
      stage: 'WRITER_READY',
      message: '네이버 글쓰기 화면 진입을 확인했습니다. 아직 내용은 입력하지 않았습니다.',
      registeredBlogId: profile.blogId,
      actualBlogId: profile.blogId,
      currentUrl: this.page.url(),
      writerHref: safeWriterHref,
    };
  }

  async bringToFront(): Promise<void> {
    await this.page.bringToFront();
  }
}

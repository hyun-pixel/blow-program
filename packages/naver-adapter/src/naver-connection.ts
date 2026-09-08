import type {
  Frame,
  Locator,
  Page,
} from 'playwright-core';
import type { DraftContent } from './contracts.js';
import {
  NaverEditorAdapter,
  type NaverEditorInputResult,
} from './naver-editor.js';
import {
  NaverDraftSaveAdapter,
  NaverDraftSaveError,
  type NaverDraftSaveResult,
} from './naver-draft-save.js';
import {
  NaverDividerAdapter,
  type NaverDividerInsertionResult,
  type NaverDividerPosition,
  type NaverDividerStyleResult,
  type NaverDividerStyleSelection,
} from './naver-divider.js';
import {
  NaverImageAdapter,
  type NaverImageAttachmentResult,
  type NaverImageLayout,
} from './naver-image.js';
import {
  NaverQuoteAdapter,
  type NaverQuoteInsertionResult,
  type NaverQuotePosition,
  type NaverQuoteStyleResult,
  type NaverQuoteStyleSelection,
} from './naver-quote.js';
import {
  NaverStickerAdapter,
  type NaverStickerCategoryResult,
  type NaverStickerInsertionResult,
  type NaverStickerPosition,
} from './naver-sticker.js';

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
  | 'NAVER_AUTH_REQUIRED'
  | 'NAVER_NETWORK_ERROR'
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

export type NaverUserInteractionType =
  | 'pointer'
  | 'keyboard'
  | 'text-input'
  | 'scroll';

export interface NaverUserInteractionResult {
  readonly detected: boolean;
  readonly interactionType?: NaverUserInteractionType;
  readonly waitedMs: number;
}

export interface NaverUserInteractionMonitorOptions {
  readonly timeoutMs?: number;
  readonly pollIntervalMs?: number;
}

export interface NaverNetworkInterruptionTestResult {
  readonly stage: 'NETWORK_INTERRUPTION_CONFIRMED';
  readonly message: string;
  readonly offlineDetected: true;
  readonly networkRestored: true;
  readonly currentUrl: string;
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


function waitForDelay(delayMs: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, delayMs);
  });
}

export function normalizeUserInteractionType(
  eventType: string,
): NaverUserInteractionType | null {
  if (eventType === 'pointerdown') {
    return 'pointer';
  }

  if (eventType === 'keydown') {
    return 'keyboard';
  }

  if (eventType === 'input') {
    return 'text-input';
  }

  if (eventType === 'wheel') {
    return 'scroll';
  }

  return null;
}

async function armUserInteractionFrame(frame: Frame): Promise<boolean> {
  try {
    await frame.evaluate(() => {
      type InteractionMonitorState = {
        detected: string | null;
        cleanup: () => void;
      };
      type InteractionMonitorWindow = Window & {
        __blowUserInteractionMonitor?: InteractionMonitorState;
      };

      const monitorWindow = window as InteractionMonitorWindow;
      monitorWindow.__blowUserInteractionMonitor?.cleanup();
      const eventNames = [
        'pointerdown',
        'keydown',
        'input',
        'wheel',
      ] as const;
      const state: InteractionMonitorState = {
        detected: null,
        cleanup: () => undefined,
      };
      const recordInteraction = (event: Event): void => {
        if (event.isTrusted && !state.detected) {
          state.detected = event.type;
        }
      };

      state.cleanup = () => {
        for (const eventName of eventNames) {
          document.removeEventListener(eventName, recordInteraction, true);
        }

        if (monitorWindow.__blowUserInteractionMonitor === state) {
          delete monitorWindow.__blowUserInteractionMonitor;
        }
      };

      for (const eventName of eventNames) {
        document.addEventListener(eventName, recordInteraction, true);
      }

      monitorWindow.__blowUserInteractionMonitor = state;
    });
    return true;
  } catch {
    return false;
  }
}

async function readUserInteractionFrame(frame: Frame): Promise<string | null> {
  try {
    return await frame.evaluate(() => {
      type InteractionMonitorWindow = Window & {
        __blowUserInteractionMonitor?: {
          detected: string | null;
        };
      };

      return (window as InteractionMonitorWindow)
        .__blowUserInteractionMonitor?.detected ?? null;
    });
  } catch {
    return null;
  }
}

async function cleanupUserInteractionFrame(frame: Frame): Promise<void> {
  await frame.evaluate(() => {
    type InteractionMonitorWindow = Window & {
      __blowUserInteractionMonitor?: {
        cleanup: () => void;
      };
    };

    (window as InteractionMonitorWindow)
      .__blowUserInteractionMonitor?.cleanup();
  }).catch(() => undefined);
}

function isRetryableVerificationError(error: unknown): boolean {
  return (
    error instanceof NaverConnectionError &&
    ['NAVER_PAGE_UNKNOWN', 'WRITER_LINK_NOT_FOUND'].includes(error.code)
  );
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

async function readNaverNetworkAvailability(page: Page): Promise<boolean> {
  try {
    return await page.evaluate(() => navigator.onLine);
  } catch {
    return true;
  }
}

async function requireNaverWriterAccess(
  page: Page,
  profile: NaverBlogProfile,
  notReadyMessage: string,
): Promise<void> {
  const currentUrl = page.url();

  if (isNaverLoginUrl(currentUrl)) {
    throw new NaverConnectionError(
      'NAVER_AUTH_REQUIRED',
      '네이버 로그인이 만료되었거나 추가 인증이 필요합니다. Chrome에서 인증을 완료한 뒤 연결을 다시 확인해 주세요.',
    );
  }

  if (!isNaverWriterUrl(currentUrl, profile.blogId)) {
    throw new NaverConnectionError('WRITER_NOT_READY', notReadyMessage);
  }

  if (!(await readNaverNetworkAvailability(page))) {
    throw new NaverConnectionError(
      'NAVER_NETWORK_ERROR',
      '인터넷 연결이 끊겨 자동 입력을 시작하지 않았습니다. 연결을 복구한 뒤 다시 시도해 주세요.',
    );
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
  private stickerAdapter: NaverStickerAdapter;

  constructor(private page: Page) {
    this.stickerAdapter = new NaverStickerAdapter(page);
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
    const stableDelayMs = Math.max(settleDelayMs, pollIntervalMs);
    const deadline = Date.now() + timeoutMs;
    let verificationRequested = isNaverLoginUrl(this.page.url());
    let lastNonLoginUrl = '';
    let nonLoginUrlStableSince = 0;
    let transientFailureCount = 0;

    await waitForDelay(settleDelayMs);

    while (Date.now() < deadline) {
      const currentUrl = this.page.url();
      let shouldVerify = !verificationRequested;

      if (verificationRequested && isNaverLoginUrl(currentUrl)) {
        lastNonLoginUrl = '';
        nonLoginUrlStableSince = 0;
        transientFailureCount = 0;
      } else if (verificationRequested && currentUrl !== lastNonLoginUrl) {
        lastNonLoginUrl = currentUrl;
        nonLoginUrlStableSince = Date.now();
      } else if (
        verificationRequested &&
        Date.now() - nonLoginUrlStableSince >= stableDelayMs
      ) {
        shouldVerify = true;
      }

      if (shouldVerify) {
        verificationRequested = true;

        try {
          const status = await this.verifyRegisteredBlog(profile);
          transientFailureCount = 0;

          if (status.stage !== 'LOGIN_REQUIRED') {
            return status;
          }
        } catch (error) {
          transientFailureCount += 1;

          if (
            this.page.isClosed() ||
            transientFailureCount >= 5 ||
            (error instanceof NaverConnectionError &&
              !isRetryableVerificationError(error))
          ) {
            throw error;
          }
        }

        lastNonLoginUrl = '';
        nonLoginUrlStableSince = 0;
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
    await this.page.goto(MY_BLOG_URL, {
      waitUntil: 'domcontentloaded',
      timeout: 30_000,
    });

    if (isNaverLoginUrl(this.page.url())) {
      return {
        stage: 'LOGIN_REQUIRED',
        message: '네이버 로그인 완료를 기다리고 있습니다. 완료되면 BLOW가 자동으로 확인합니다.',
        registeredBlogId: profile.blogId,
        currentUrl: this.page.url(),
      };
    }

    const actualBlogId = getBlogIdFromNaverUrl(this.page.url());

    if (!actualBlogId) {
      throw new NaverConnectionError(
        'NAVER_PAGE_UNKNOWN',
        '로그인된 블로그 주소를 확인할 수 없어 작업을 멈췄습니다.',
      );
    }

    if (actualBlogId !== profile.blogId) {
      return {
        stage: 'BLOG_MISMATCH',
        message: '로그인된 블로그와 입력한 주소가 다릅니다. 주소 또는 로그인 계정을 확인해 주세요.',
        registeredBlogId: profile.blogId,
        actualBlogId,
        currentUrl: this.page.url(),
      };
    }

    await this.page.goto(BLOG_HOME_URL, {
      waitUntil: 'domcontentloaded',
      timeout: 30_000,
    });
    await waitForHomeControls(this.page);

    const candidates = await getWriterCandidates(this.page);
    const writerHref = selectUniqueWriterHref(
      candidates.map((candidate) => candidate.href),
    );

    return {
      stage: 'WRITER_LINK_READY',
      message: '등록 블로그와 글쓰기 이동 경로를 확인했습니다.',
      registeredBlogId: profile.blogId,
      actualBlogId,
      currentUrl: this.page.url(),
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
    this.stickerAdapter = new NaverStickerAdapter(this.page);

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

  async enterContent(
    profile: NaverBlogProfile,
    content: DraftContent,
    signal?: AbortSignal,
  ): Promise<NaverEditorInputResult> {
    await requireNaverWriterAccess(
      this.page,
      profile,
      '네이버 글쓰기 화면이 아니어서 입력을 시작하지 않았습니다.',
    );

    const editor = new NaverEditorAdapter(this.page);
    return editor.enterAndVerify(content, signal);
  }

  async listDividerStyles(
    profile: NaverBlogProfile,
    expectedParagraphs: readonly string[],
    paragraphNumber: number,
    position: NaverDividerPosition,
    signal?: AbortSignal,
  ): Promise<NaverDividerStyleResult> {
    await requireNaverWriterAccess(
      this.page,
      profile,
      '네이버 글쓰기 화면이 아니어서 구분선 디자인 확인을 시작하지 않았습니다.',
    );

    const dividerAdapter = new NaverDividerAdapter(this.page);
    return dividerAdapter.listDividerStyles(
      expectedParagraphs,
      paragraphNumber,
      position,
      signal,
    );
  }

  async insertDivider(
    profile: NaverBlogProfile,
    expectedParagraphs: readonly string[],
    paragraphNumber: number,
    position: NaverDividerPosition,
    styleSelection?: NaverDividerStyleSelection,
    signal?: AbortSignal,
  ): Promise<NaverDividerInsertionResult> {
    await requireNaverWriterAccess(
      this.page,
      profile,
      '네이버 글쓰기 화면이 아니어서 구분선 삽입을 시작하지 않았습니다.',
    );

    const dividerAdapter = new NaverDividerAdapter(this.page);
    return dividerAdapter.insertDivider(
      expectedParagraphs,
      paragraphNumber,
      position,
      styleSelection,
      signal,
    );
  }

  async insertDefaultSticker(
    profile: NaverBlogProfile,
    expectedParagraphs: readonly string[],
    paragraphNumber: number,
    position: NaverStickerPosition,
  ): Promise<NaverStickerInsertionResult> {
    await requireNaverWriterAccess(
      this.page,
      profile,
      '네이버 글쓰기 화면이 아니어서 스티커 삽입을 시작하지 않았습니다.',
    );

    return this.stickerAdapter.insertDefaultSticker(
      expectedParagraphs,
      paragraphNumber,
      position,
    );
  }

  async listStickerCategories(
    profile: NaverBlogProfile,
    expectedParagraphs: readonly string[],
    paragraphNumber: number,
    position: NaverStickerPosition,
    signal?: AbortSignal,
  ): Promise<NaverStickerCategoryResult> {
    await requireNaverWriterAccess(
      this.page,
      profile,
      '네이버 글쓰기 화면이 아니어서 스티커 묶음을 불러오지 않았습니다.',
    );

    return this.stickerAdapter.listStickerCategories(
      expectedParagraphs,
      paragraphNumber,
      position,
      signal,
    );
  }

  async insertRandomSticker(
    profile: NaverBlogProfile,
    expectedParagraphs: readonly string[],
    paragraphNumber: number,
    position: NaverStickerPosition,
    categoryId: string,
    signal?: AbortSignal,
  ): Promise<NaverStickerInsertionResult> {
    await requireNaverWriterAccess(
      this.page,
      profile,
      '네이버 글쓰기 화면이 아니어서 스티커 삽입을 시작하지 않았습니다.',
    );

    return this.stickerAdapter.insertRandomSticker(
      expectedParagraphs,
      paragraphNumber,
      position,
      categoryId,
      signal,
    );
  }

  async listQuoteStyles(
    profile: NaverBlogProfile,
    expectedParagraphs: readonly string[],
    paragraphNumber: number,
    position: NaverQuotePosition,
    signal?: AbortSignal,
  ): Promise<NaverQuoteStyleResult> {
    await requireNaverWriterAccess(
      this.page,
      profile,
      '네이버 글쓰기 화면이 아니어서 인용구 디자인 확인을 시작하지 않았습니다.',
    );

    const quoteAdapter = new NaverQuoteAdapter(this.page);
    return quoteAdapter.listQuoteStyles(
      expectedParagraphs,
      paragraphNumber,
      position,
      signal,
    );
  }

  async insertQuote(
    profile: NaverBlogProfile,
    expectedParagraphs: readonly string[],
    paragraphNumber: number,
    position: NaverQuotePosition,
    styleSelection?: NaverQuoteStyleSelection,
    signal?: AbortSignal,
  ): Promise<NaverQuoteInsertionResult> {
    await requireNaverWriterAccess(
      this.page,
      profile,
      '네이버 글쓰기 화면이 아니어서 인용구 삽입을 시작하지 않았습니다.',
    );

    const quoteAdapter = new NaverQuoteAdapter(this.page);
    return quoteAdapter.insertQuote(
      expectedParagraphs,
      paragraphNumber,
      position,
      styleSelection,
      signal,
    );
  }

  async saveDraft(
    profile: NaverBlogProfile,
    content: DraftContent,
    signal?: AbortSignal,
  ): Promise<NaverDraftSaveResult> {
    await requireNaverWriterAccess(
      this.page,
      profile,
      '네이버 글쓰기 화면이 아니어서 임시저장을 시작하지 않았습니다.',
    );

    const editor = new NaverEditorAdapter(this.page);
    await editor.verifyCurrent(content);

    const draftSaveAdapter = new NaverDraftSaveAdapter(this.page);
    const result = await draftSaveAdapter.saveAndVerify(signal);

    if (isNaverLoginUrl(result.currentUrl)) {
      throw new NaverConnectionError(
        'NAVER_AUTH_REQUIRED',
        '임시저장 버튼 조작 후 네이버 인증 화면으로 이동했습니다. Chrome에서 저장 여부와 인증 상태를 확인해 주세요.',
      );
    }

    if (!isNaverWriterUrl(result.currentUrl, profile.blogId)) {
      throw new NaverDraftSaveError(
        'DRAFT_SAVE_NAVIGATION_UNEXPECTED',
        '임시저장 후 예상하지 못한 화면으로 이동해 완료로 처리하지 않았습니다. Chrome에서 저장 여부를 확인해 주세요.',
      );
    }

    return result;
  }

  async attachImages(
    profile: NaverBlogProfile,
    imagePaths: readonly string[],
    layout: NaverImageLayout,
    signal?: AbortSignal,
  ): Promise<NaverImageAttachmentResult> {
    await requireNaverWriterAccess(
      this.page,
      profile,
      '네이버 글쓰기 화면이 아니어서 이미지 첨부를 시작하지 않았습니다.',
    );

    const imageAdapter = new NaverImageAdapter(this.page);
    return imageAdapter.attachImages(imagePaths, layout, signal);
  }

  async isNetworkAvailable(): Promise<boolean> {
    return readNaverNetworkAvailability(this.page);
  }

  currentUrl(): string {
    return this.page.url();
  }

  async waitForUserInteraction(
    options: NaverUserInteractionMonitorOptions = {},
  ): Promise<NaverUserInteractionResult> {
    const timeoutMs = Math.min(Math.max(options.timeoutMs ?? 10_000, 1), 30_000);
    const pollIntervalMs = Math.min(
      Math.max(options.pollIntervalMs ?? 100, 25),
      500,
    );
    const startedAt = Date.now();
    const armedFrames = new Set<Frame>();

    try {
      for (const frame of this.page.frames()) {
        if (await armUserInteractionFrame(frame)) {
          armedFrames.add(frame);
        }
      }

      if (armedFrames.size === 0) {
        throw new NaverConnectionError(
          'NAVER_PAGE_UNKNOWN',
          '현재 Chrome 화면에서 사용자 조작 감지를 시작할 수 없습니다.',
        );
      }

      await this.page.bringToFront();

      while (Date.now() - startedAt < timeoutMs) {
        if (this.page.isClosed()) {
          throw new Error('Target page has been closed.');
        }

        for (const frame of this.page.frames()) {
          if (!armedFrames.has(frame) && await armUserInteractionFrame(frame)) {
            armedFrames.add(frame);
          }
        }

        for (const frame of armedFrames) {
          const eventType = await readUserInteractionFrame(frame);
          const interactionType = eventType
            ? normalizeUserInteractionType(eventType)
            : null;

          if (interactionType) {
            return {
              detected: true,
              interactionType,
              waitedMs: Date.now() - startedAt,
            };
          }
        }

        await waitForDelay(pollIntervalMs);
      }

      return {
        detected: false,
        waitedMs: Date.now() - startedAt,
      };
    } finally {
      await Promise.all(
        [...armedFrames].map((frame) => cleanupUserInteractionFrame(frame)),
      );
    }
  }

  async bringToFront(): Promise<void> {
    await this.page.bringToFront();
  }
}

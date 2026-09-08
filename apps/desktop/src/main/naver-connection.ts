import { mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';
import {
  NaverConnectionAdapter,
  NaverConnectionError,
  NaverDividerError,
  NaverDraftSaveError,
  NaverEditorError,
  NaverImageError,
  NaverQuoteError,
  NaverStickerError,
  parseNaverBlogUrl,
  validateDraftContent,
  type DraftContent,
  type NaverBlogProfile,
  type NaverConnectionStatus,
  type NaverDividerInsertionResult,
  type NaverDividerPosition,
  type NaverDividerStyleResult,
  type NaverDividerStyleSelection,
  type NaverDraftSaveResult,
  type NaverEditorInputResult,
  type NaverImageAttachmentResult,
  type NaverImageLayout,
  type NaverNetworkInterruptionTestResult,
  type NaverStructureChangeTestResult,
  type NaverQuoteInsertionResult,
  type NaverQuotePosition,
  type NaverQuoteStyleResult,
  type NaverQuoteStyleSelection,
  type NaverStickerCategoryResult,
  type NaverStickerInsertionResult,
  type NaverStickerPosition,
  type NaverUserInteractionResult,
} from '@blow/naver-adapter';
import {
  chromium,
  type BrowserContext,
  type Page,
  type Route,
} from 'playwright-core';
import type {
  SlowNetworkTestResult,
  WriterNavigationRepeatProgress,
  WriterNavigationRepeatResult,
} from '../shared/compatibility-environment.js';

export interface NaverConnectionOptions {
  readonly profilePath: string;
  readonly blogUrl: string;
  readonly headless: boolean;
}

export type NaverRunnerFailureCode =
  | 'BROWSER_CLOSED'
  | 'CHROME_NOT_FOUND'
  | 'PROFILE_IN_USE'
  | 'INVALID_BLOG_URL'
  | 'LOGIN_WAIT_TIMEOUT'
  | 'NAVER_AUTH_REQUIRED'
  | 'NAVER_PAGE_UNKNOWN'
  | 'USER_INTERACTION_DETECTED'
  | 'WRITER_LINK_NOT_FOUND'
  | 'WRITER_LINK_AMBIGUOUS'
  | 'WRITER_NOT_READY'
  | 'INVALID_DRAFT_CONTENT'
  | 'EDITOR_NOT_READY'
  | 'EDITOR_FIELD_AMBIGUOUS'
  | 'EDITOR_NOT_BLANK'
  | 'EDITOR_INPUT_INTERRUPTED'
  | 'EDITOR_INPUT_MISMATCH'
  | 'DRAFT_SAVE_OPERATION_INTERRUPTED'
  | 'DRAFT_SAVE_CONTROL_NOT_FOUND'
  | 'DRAFT_SAVE_CONTROL_AMBIGUOUS'
  | 'DRAFT_SAVE_CLICK_FAILED'
  | 'DRAFT_SAVE_UNCONFIRMED'
  | 'DRAFT_SAVE_NAVIGATION_UNEXPECTED'
  | 'INVALID_DIVIDER_REQUEST'
  | 'DIVIDER_OPERATION_INTERRUPTED'
  | 'DIVIDER_ANCHOR_NOT_FOUND'
  | 'DIVIDER_ANCHOR_MISMATCH'
  | 'DIVIDER_SELECTION_FAILED'
  | 'DIVIDER_CONTROL_NOT_FOUND'
  | 'DIVIDER_CONTROL_AMBIGUOUS'
  | 'DIVIDER_STYLE_CONTROL_NOT_FOUND'
  | 'DIVIDER_STYLE_CONTROL_AMBIGUOUS'
  | 'DIVIDER_STYLE_NOT_FOUND'
  | 'DIVIDER_STYLE_AMBIGUOUS'
  | 'DIVIDER_STYLE_STALE'
  | 'DIVIDER_STYLE_MISMATCH'
  | 'DIVIDER_INSERT_UNCONFIRMED'
  | 'DIVIDER_POSITION_MISMATCH'
  | 'INVALID_IMAGE_SELECTION'
  | 'IMAGE_INPUT_NOT_FOUND'
  | 'IMAGE_INPUT_AMBIGUOUS'
  | 'IMAGE_UPLOAD_INTERRUPTED'
  | 'IMAGE_UPLOAD_FAILED'
  | 'IMAGE_PARTIAL_UPLOAD'
  | 'IMAGE_COUNT_MISMATCH'
  | 'IMAGE_LAYOUT_CONTROL_NOT_FOUND'
  | 'IMAGE_LAYOUT_CONTROL_AMBIGUOUS'
  | 'IMAGE_LAYOUT_MISMATCH'
  | 'INVALID_QUOTE_REQUEST'
  | 'QUOTE_OPERATION_INTERRUPTED'
  | 'QUOTE_ANCHOR_NOT_FOUND'
  | 'QUOTE_ANCHOR_MISMATCH'
  | 'QUOTE_SELECTION_FAILED'
  | 'QUOTE_CONTROL_NOT_FOUND'
  | 'QUOTE_CONTROL_AMBIGUOUS'
  | 'QUOTE_STYLE_CONTROL_NOT_FOUND'
  | 'QUOTE_STYLE_CONTROL_AMBIGUOUS'
  | 'QUOTE_STYLE_NOT_FOUND'
  | 'QUOTE_STYLE_AMBIGUOUS'
  | 'QUOTE_STYLE_STALE'
  | 'QUOTE_STYLE_MISMATCH'
  | 'QUOTE_INSERT_UNCONFIRMED'
  | 'QUOTE_POSITION_MISMATCH'
  | 'INVALID_STICKER_REQUEST'
  | 'STICKER_OPERATION_INTERRUPTED'
  | 'STICKER_ANCHOR_NOT_FOUND'
  | 'STICKER_ANCHOR_MISMATCH'
  | 'STICKER_SELECTION_FAILED'
  | 'STICKER_CONTROL_NOT_FOUND'
  | 'STICKER_CONTROL_AMBIGUOUS'
  | 'STICKER_CATEGORY_NOT_FOUND'
  | 'STICKER_CATEGORY_AMBIGUOUS'
  | 'STICKER_CATEGORY_STALE'
  | 'STICKER_ITEM_NOT_FOUND'
  | 'STICKER_INSERT_UNCONFIRMED'
  | 'STICKER_POSITION_MISMATCH'
  | 'CONTENT_INPUT_REQUIRED'
  | 'NAVER_NETWORK_ERROR'
  | 'NETWORK_TEST_UNCONFIRMED'
  | 'NETWORK_TEST_RESTORE_FAILED'
  | 'STRUCTURE_TEST_UNCONFIRMED'
  | 'CHROME_VERSION_UNCONFIRMED'
  | 'WRITER_NAVIGATION_REPEAT_FAILED'
  | 'SLOW_NETWORK_TEST_FAILED'
  | 'NAVER_CONNECTION_FAILED';

export interface NaverRunnerFailure {
  readonly code: NaverRunnerFailureCode;
  readonly message: string;
}

export class NaverConnectionRunnerError extends Error {
  constructor(
    readonly failure: NaverRunnerFailure,
    options?: ErrorOptions,
  ) {
    super(failure.message, options);
    this.name = 'NaverConnectionRunnerError';
  }
}

function classifyFailure(error: unknown): NaverRunnerFailure {
  if (
    error instanceof NaverConnectionError ||
    error instanceof NaverDividerError ||
    error instanceof NaverDraftSaveError ||
    error instanceof NaverEditorError ||
    error instanceof NaverImageError ||
    error instanceof NaverQuoteError ||
    error instanceof NaverStickerError
  ) {
    return {
      code: error.code,
      message: error.message,
    };
  }

  const detail = error instanceof Error ? error.message : String(error);

  if (/target page.*closed|context.*closed|browser.*closed/i.test(detail)) {
    return {
      code: 'BROWSER_CLOSED',
      message: '전용 Chrome이 닫혔습니다. 다시 열어 주세요.',
    };
  }

  if (/executable.*doesn.t exist|chrome.*not found/i.test(detail)) {
    return {
      code: 'CHROME_NOT_FOUND',
      message: 'Chrome을 찾을 수 없습니다. Chrome 설치를 확인해 주세요.',
    };
  }

  if (
    /processsingleton|profile.*in use|user data directory is already in use/i.test(
      detail,
    )
  ) {
    return {
      code: 'PROFILE_IN_USE',
      message: 'BLOW 전용 Chrome이 이미 실행 중입니다.',
    };
  }

  if (/net::ERR_|timeout.*exceeded|network/i.test(detail)) {
    return {
      code: 'NAVER_NETWORK_ERROR',
      message: '네이버 화면을 열 수 없습니다. 인터넷 연결을 확인해 주세요.',
    };
  }

  return {
    code: 'NAVER_CONNECTION_FAILED',
    message: '네이버 연결 상태를 확인하지 못했습니다. 다시 시도해 주세요.',
  };
}

export class NaverConnectionSession {
  private enteredContent: DraftContent | null = null;

  private constructor(
    private context: BrowserContext | undefined,
    readonly profile: NaverBlogProfile,
    private readonly adapter: NaverConnectionAdapter,
    private writerHref?: string,
  ) {}

  static async create(
    options: NaverConnectionOptions,
  ): Promise<{
    readonly session: NaverConnectionSession;
    readonly status: NaverConnectionStatus;
  }> {
    const profile = parseNaverBlogUrl(options.blogUrl);
    let context: BrowserContext | undefined;

    try {
      await mkdir(dirname(options.profilePath), { recursive: true });
      context = await chromium.launchPersistentContext(options.profilePath, {
        channel: 'chrome',
        headless: options.headless,
        viewport: null,
        acceptDownloads: false,
      });

      const page = context.pages()[0] ?? (await context.newPage());
      const adapter = new NaverConnectionAdapter(page);
      const status = await adapter.openHome(profile);
      const session = new NaverConnectionSession(
        context,
        profile,
        adapter,
      );

      return { session, status };
    } catch (error) {
      await context?.close().catch(() => undefined);
      throw new NaverConnectionRunnerError(classifyFailure(error), {
        cause: error,
      });
    }
  }

  async waitForLoginAndVerify(): Promise<NaverConnectionStatus> {
    try {
      const status = await this.adapter.waitForLoginAndVerify(this.profile);
      this.writerHref = status.writerHref;
      return status;
    } catch (error) {
      throw new NaverConnectionRunnerError(classifyFailure(error), {
        cause: error,
      });
    }
  }

  async verify(): Promise<NaverConnectionStatus> {
    try {
      const status = await this.adapter.waitForLoginAndVerify(this.profile);
      this.writerHref = status.writerHref;
      return status;
    } catch (error) {
      throw new NaverConnectionRunnerError(classifyFailure(error), {
        cause: error,
      });
    }
  }

  async openWriter(): Promise<NaverConnectionStatus> {
    if (!this.writerHref) {
      throw new NaverConnectionRunnerError({
        code: 'WRITER_NOT_READY',
        message: '먼저 로그인과 등록 블로그 연결을 확인해 주세요.',
      });
    }

    try {
      return await this.adapter.openWriter(this.profile, this.writerHref);
    } catch (error) {
      throw new NaverConnectionRunnerError(classifyFailure(error), {
        cause: error,
      });
    }
  }

  async enterContent(
    content: DraftContent,
    signal?: AbortSignal,
  ): Promise<NaverEditorInputResult> {
    try {
      const normalizedContent = validateDraftContent(content);
      const result = await this.adapter.enterContent(
        this.profile,
        normalizedContent,
        signal,
      );
      this.enteredContent = normalizedContent;
      return result;
    } catch (error) {
      throw new NaverConnectionRunnerError(classifyFailure(error), {
        cause: error,
      });
    }
  }

  async listDividerStyles(
    paragraphNumber: number,
    position: NaverDividerPosition,
    signal?: AbortSignal,
  ): Promise<NaverDividerStyleResult> {
    const content = this.enteredContent;

    if (!content) {
      throw new NaverConnectionRunnerError({
        code: 'CONTENT_INPUT_REQUIRED',
        message: '먼저 제목과 본문 입력을 완료해 주세요.',
      });
    }

    try {
      return await this.adapter.listDividerStyles(
        this.profile,
        content.paragraphs,
        paragraphNumber,
        position,
        signal,
      );
    } catch (error) {
      throw new NaverConnectionRunnerError(classifyFailure(error), {
        cause: error,
      });
    }
  }

  async insertDivider(
    paragraphNumber: number,
    position: NaverDividerPosition,
    styleSelection?: NaverDividerStyleSelection,
    signal?: AbortSignal,
  ): Promise<NaverDividerInsertionResult> {
    const content = this.enteredContent;

    if (!content) {
      throw new NaverConnectionRunnerError({
        code: 'CONTENT_INPUT_REQUIRED',
        message: '먼저 제목과 본문 입력을 완료해 주세요.',
      });
    }

    try {
      return await this.adapter.insertDivider(
        this.profile,
        content.paragraphs,
        paragraphNumber,
        position,
        styleSelection,
        signal,
      );
    } catch (error) {
      throw new NaverConnectionRunnerError(classifyFailure(error), {
        cause: error,
      });
    }
  }

  async listStickerCategories(
    paragraphNumber: number,
    position: NaverStickerPosition,
    signal?: AbortSignal,
  ): Promise<NaverStickerCategoryResult> {
    const content = this.enteredContent;

    if (!content) {
      throw new NaverConnectionRunnerError({
        code: 'CONTENT_INPUT_REQUIRED',
        message: '먼저 제목과 본문 입력을 완료해 주세요.',
      });
    }

    try {
      return await this.adapter.listStickerCategories(
        this.profile,
        content.paragraphs,
        paragraphNumber,
        position,
        signal,
      );
    } catch (error) {
      throw new NaverConnectionRunnerError(classifyFailure(error), {
        cause: error,
      });
    }
  }

  async insertRandomSticker(
    paragraphNumber: number,
    position: NaverStickerPosition,
    categoryId: string,
    signal?: AbortSignal,
  ): Promise<NaverStickerInsertionResult> {
    const content = this.enteredContent;

    if (!content) {
      throw new NaverConnectionRunnerError({
        code: 'CONTENT_INPUT_REQUIRED',
        message: '먼저 제목과 본문 입력을 완료해 주세요.',
      });
    }

    try {
      return await this.adapter.insertRandomSticker(
        this.profile,
        content.paragraphs,
        paragraphNumber,
        position,
        categoryId,
        signal,
      );
    } catch (error) {
      throw new NaverConnectionRunnerError(classifyFailure(error), {
        cause: error,
      });
    }
  }

  async insertDefaultSticker(
    paragraphNumber: number,
    position: NaverStickerPosition,
  ): Promise<NaverStickerInsertionResult> {
    const content = this.enteredContent;

    if (!content) {
      throw new NaverConnectionRunnerError({
        code: 'CONTENT_INPUT_REQUIRED',
        message: '먼저 제목과 본문 입력을 완료해 주세요.',
      });
    }

    try {
      return await this.adapter.insertDefaultSticker(
        this.profile,
        content.paragraphs,
        paragraphNumber,
        position,
      );
    } catch (error) {
      throw new NaverConnectionRunnerError(classifyFailure(error), {
        cause: error,
      });
    }
  }

  async listQuoteStyles(
    paragraphNumber: number,
    position: NaverQuotePosition,
    signal?: AbortSignal,
  ): Promise<NaverQuoteStyleResult> {
    const content = this.enteredContent;

    if (!content) {
      throw new NaverConnectionRunnerError({
        code: 'CONTENT_INPUT_REQUIRED',
        message: '먼저 제목과 본문 입력을 완료해 주세요.',
      });
    }

    try {
      return await this.adapter.listQuoteStyles(
        this.profile,
        content.paragraphs,
        paragraphNumber,
        position,
        signal,
      );
    } catch (error) {
      throw new NaverConnectionRunnerError(classifyFailure(error), {
        cause: error,
      });
    }
  }

  async insertQuote(
    paragraphNumber: number,
    position: NaverQuotePosition,
    styleSelection?: NaverQuoteStyleSelection,
    signal?: AbortSignal,
  ): Promise<NaverQuoteInsertionResult> {
    const content = this.enteredContent;

    if (!content) {
      throw new NaverConnectionRunnerError({
        code: 'CONTENT_INPUT_REQUIRED',
        message: '먼저 제목과 본문 입력을 완료해 주세요.',
      });
    }

    try {
      return await this.adapter.insertQuote(
        this.profile,
        content.paragraphs,
        paragraphNumber,
        position,
        styleSelection,
        signal,
      );
    } catch (error) {
      throw new NaverConnectionRunnerError(classifyFailure(error), {
        cause: error,
      });
    }
  }

  async saveDraft(signal?: AbortSignal): Promise<NaverDraftSaveResult> {
    const content = this.enteredContent;

    if (!content) {
      throw new NaverConnectionRunnerError({
        code: 'CONTENT_INPUT_REQUIRED',
        message: '먼저 제목과 본문 입력을 완료해 주세요.',
      });
    }

    try {
      return await this.adapter.saveDraft(this.profile, content, signal);
    } catch (error) {
      throw new NaverConnectionRunnerError(classifyFailure(error), {
        cause: error,
      });
    }
  }

  async attachImages(
    imagePaths: readonly string[],
    layout: NaverImageLayout,
    signal?: AbortSignal,
  ): Promise<NaverImageAttachmentResult> {
    if (!this.enteredContent) {
      throw new NaverConnectionRunnerError({
        code: 'CONTENT_INPUT_REQUIRED',
        message: '먼저 제목과 본문 입력을 완료해 주세요.',
      });
    }

    try {
      return await this.adapter.attachImages(
        this.profile,
        imagePaths,
        layout,
        signal,
      );
    } catch (error) {
      throw new NaverConnectionRunnerError(classifyFailure(error), {
        cause: error,
      });
    }
  }

  async testNetworkInterruption(): Promise<NaverNetworkInterruptionTestResult> {
    const context = this.context;

    if (!context) {
      throw new NaverConnectionRunnerError({
        code: 'BROWSER_CLOSED',
        message: '전용 Chrome이 닫혔습니다. 다시 열어 주세요.',
      });
    }

    let testFailure: NaverConnectionRunnerError | null = null;
    let offlineDetected = false;

    try {
      await context.setOffline(true);
      await new Promise((resolve) => setTimeout(resolve, 150));
      offlineDetected = !(await this.adapter.isNetworkAvailable());

      if (!offlineDetected) {
        testFailure = new NaverConnectionRunnerError({
          code: 'NETWORK_TEST_UNCONFIRMED',
          message: '전용 Chrome의 네트워크 차단 상태를 확인하지 못했습니다. 다시 시도해 주세요.',
        });
      }
    } catch (error) {
      testFailure = error instanceof NaverConnectionRunnerError
        ? error
        : new NaverConnectionRunnerError(classifyFailure(error), {
            cause: error,
          });
    }

    try {
      await context.setOffline(false);
      await new Promise((resolve) => setTimeout(resolve, 150));

      if (!(await this.adapter.isNetworkAvailable())) {
        throw new NaverConnectionRunnerError({
          code: 'NETWORK_TEST_RESTORE_FAILED',
          message: '전용 Chrome의 네트워크 상태를 복구하지 못했습니다. 작업을 중단하고 Chrome을 다시 열어 주세요.',
        });
      }
    } catch (error) {
      throw new NaverConnectionRunnerError(
        {
          code: 'NETWORK_TEST_RESTORE_FAILED',
          message: '전용 Chrome의 네트워크 상태를 복구하지 못했습니다. 작업을 중단하고 Chrome을 다시 열어 주세요.',
        },
        { cause: error },
      );
    }

    if (testFailure) {
      throw testFailure;
    }

    return {
      stage: 'NETWORK_INTERRUPTION_CONFIRMED',
      message: '전용 Chrome의 네트워크 차단을 감지하고 연결 상태를 복구했습니다.',
      offlineDetected: true,
      networkRestored: true,
      currentUrl: this.adapter.currentUrl(),
    };
  }

  async testStructureChangeSafety(): Promise<NaverStructureChangeTestResult> {
    try {
      return await this.adapter.testStructureChangeSafety(this.profile);
    } catch (error) {
      throw new NaverConnectionRunnerError(classifyFailure(error), {
        cause: error,
      });
    }
  }

  async testWriterNavigationRepetition(
    totalRuns = 20,
    onProgress?: (progress: WriterNavigationRepeatProgress) => void,
  ): Promise<WriterNavigationRepeatResult> {
    const context = this.context;

    if (!context) {
      throw new NaverConnectionRunnerError({
        code: 'BROWSER_CLOSED',
        message: '전용 Chrome이 닫혔습니다. 다시 열어 주세요.',
      });
    }

    if (!Number.isInteger(totalRuns) || totalRuns < 1 || totalRuns > 20) {
      throw new NaverConnectionRunnerError({
        code: 'WRITER_NAVIGATION_REPEAT_FAILED',
        message: '반복 횟수는 1회부터 20회까지 설정할 수 있습니다.',
      });
    }

    const chromeVersion = this.getChromeVersion();
    const writerHref = this.writerHref;

    if (!writerHref) {
      throw new NaverConnectionRunnerError({
        code: 'WRITER_NAVIGATION_REPEAT_FAILED',
        message: '먼저 등록 블로그와 글쓰기 이동 경로를 확인해 주세요.',
      });
    }
    let completedRuns = 0;

    try {
      for (let runNumber = 1; runNumber <= totalRuns; runNumber += 1) {
        let testPage: Page | undefined;
        let testAdapter: NaverConnectionAdapter | undefined;
        let testStep = '검증용 탭 열기';

        try {
          testPage = await context.newPage();
          testStep = '네이버 블로그 홈 확인';
          testAdapter = new NaverConnectionAdapter(testPage);
          const homeStatus = await testAdapter.openHome(this.profile);

          if (homeStatus.stage === 'LOGIN_REQUIRED') {
            throw new NaverConnectionError(
              'NAVER_AUTH_REQUIRED',
              '네이버 로그인이 만료되었습니다. Chrome에서 다시 로그인해 주세요.',
            );
          }

          testStep = '글쓰기 링크 클릭';
          const writerStatus = await testAdapter.openWriter(
            this.profile,
            writerHref,
          );

          if (writerStatus.stage === 'LOGIN_REQUIRED') {
            throw new NaverConnectionError(
              'NAVER_AUTH_REQUIRED',
              '네이버 로그인이 만료되었습니다. Chrome에서 다시 로그인해 주세요.',
            );
          }

          if (writerStatus.stage !== 'WRITER_READY') {
            throw new NaverConnectionRunnerError({
              code: 'WRITER_NAVIGATION_REPEAT_FAILED',
              message: '네이버 글쓰기 화면 진입을 확인하지 못했습니다.',
            });
          }

          testStep = '글쓰기 화면 주소 확인';
          completedRuns = runNumber;
          onProgress?.({ completedRuns, totalRuns });
        } catch (error) {
          const failure = error instanceof NaverConnectionRunnerError
            ? error.failure
            : classifyFailure(error);

          throw new NaverConnectionRunnerError(
            {
              code: failure.code,
              message: failure.code === 'NAVER_CONNECTION_FAILED'
                ? `${runNumber}회차 ${testStep} 단계에서 연결 상태를 확인하지 못했습니다.`
                : `${runNumber}회차에서 중단했습니다. ${failure.message}`,
            },
            { cause: error },
          );
        } finally {
          await testAdapter?.closePage().catch(() => undefined);

          if (testPage && !testPage.isClosed()) {
            await testPage.close().catch(() => undefined);
          }
        }
      }
    } finally {
      await this.adapter.bringToFront().catch(() => undefined);
    }

    return {
      stage: 'WRITER_NAVIGATION_REPEAT_CONFIRMED',
      message: `네이버 글쓰기 화면 진입을 ${totalRuns}회 연속 확인했습니다.`,
      completedRuns,
      totalRuns,
      chromeVersion,
    };
  }

  async testSlowNetwork(
    latencyMs = 1_500,
  ): Promise<SlowNetworkTestResult> {
    const context = this.context;

    if (!context) {
      throw new NaverConnectionRunnerError({
        code: 'BROWSER_CLOSED',
        message: '전용 Chrome이 닫혔습니다. 다시 열어 주세요.',
      });
    }

    if (!Number.isInteger(latencyMs) || latencyMs < 500 || latencyMs > 5_000) {
      throw new NaverConnectionRunnerError({
        code: 'SLOW_NETWORK_TEST_FAILED',
        message: '느린 네트워크 지연 시간 설정이 올바르지 않습니다.',
      });
    }

    const writerHref = this.writerHref;

    if (!writerHref) {
      throw new NaverConnectionRunnerError({
        code: 'SLOW_NETWORK_TEST_FAILED',
        message: '먼저 등록 블로그와 글쓰기 이동 경로를 확인해 주세요.',
      });
    }

    let testPage: Page | undefined;
    let testAdapter: NaverConnectionAdapter | undefined;
    let delayedNavigationCount = 0;
    const throttledPages = new Set<Page>();
    const slowNavigation = async (route: Route): Promise<void> => {
      try {
        const request = route.request();
        const requestPage = request.frame().page();
        let shouldDelay = throttledPages.has(requestPage);

        if (!shouldDelay) {
          const opener = await requestPage.opener();

          if (opener && throttledPages.has(opener)) {
            throttledPages.add(requestPage);
            shouldDelay = true;
          }
        }

        if (shouldDelay && request.resourceType() === 'document') {
          delayedNavigationCount += 1;
          await new Promise((resolve) => setTimeout(resolve, latencyMs));
        }

        await route.continue();
      } catch {
        await route.continue().catch(() => undefined);
      }
    };

    try {
      testPage = await context.newPage();
      throttledPages.add(testPage);
      await context.route('**/*', slowNavigation);
      testAdapter = new NaverConnectionAdapter(testPage);

      const homeStatus = await testAdapter.openHome(this.profile);

      if (homeStatus.stage === 'LOGIN_REQUIRED') {
        throw new NaverConnectionError(
          'NAVER_AUTH_REQUIRED',
          '네이버 로그인이 만료되었습니다. Chrome에서 다시 로그인해 주세요.',
        );
      }

      const writerStatus = await testAdapter.openWriter(
        this.profile,
        writerHref,
      );

      if (writerStatus.stage === 'LOGIN_REQUIRED') {
        throw new NaverConnectionError(
          'NAVER_AUTH_REQUIRED',
          '네이버 로그인이 만료되었습니다. Chrome에서 다시 로그인해 주세요.',
        );
      }

      if (writerStatus.stage !== 'WRITER_READY') {
        throw new NaverConnectionRunnerError({
          code: 'SLOW_NETWORK_TEST_FAILED',
          message: '느린 네트워크에서 글쓰기 화면 진입을 확인하지 못했습니다.',
        });
      }

      if (delayedNavigationCount < 2) {
        throw new NaverConnectionRunnerError({
          code: 'SLOW_NETWORK_TEST_FAILED',
          message: '페이지 이동 지연이 충분히 적용됐는지 확인하지 못했습니다.',
        });
      }

      return {
        stage: 'SLOW_NETWORK_CONFIRMED',
        message: '느린 네트워크에서도 블로그 홈과 글쓰기 화면 진입을 완료했습니다.',
        latencyMs,
        delayedNavigationCount,
        blogHomeReached: true,
        writerReached: true,
        chromeVersion: this.getChromeVersion(),
      };
    } catch (error) {
      if (error instanceof NaverConnectionRunnerError) {
        throw error;
      }

      throw new NaverConnectionRunnerError(classifyFailure(error), {
        cause: error,
      });
    } finally {
      await context.unroute('**/*', slowNavigation).catch(() => undefined);
      await testAdapter?.closePage().catch(() => undefined);

      if (testPage && !testPage.isClosed()) {
        await testPage.close().catch(() => undefined);
      }

      await this.adapter.bringToFront().catch(() => undefined);
    }
  }

  getChromeVersion(): string {
    const context = this.context;

    if (!context) {
      throw new NaverConnectionRunnerError({
        code: 'BROWSER_CLOSED',
        message: '전용 Chrome이 닫혔습니다. 다시 열어 주세요.',
      });
    }

    const version = context.browser()?.version().trim();

    if (!version) {
      throw new NaverConnectionRunnerError({
        code: 'CHROME_VERSION_UNCONFIRMED',
        message: '전용 Chrome 버전을 확인하지 못했습니다. Chrome을 다시 열어 주세요.',
      });
    }

    return version;
  }

  async waitForUserInteraction(
    timeoutMs = 10_000,
  ): Promise<NaverUserInteractionResult> {
    try {
      return await this.adapter.waitForUserInteraction({ timeoutMs });
    } catch (error) {
      throw new NaverConnectionRunnerError(classifyFailure(error), {
        cause: error,
      });
    }
  }

  async bringToFront(): Promise<void> {
    await this.adapter.bringToFront();
  }

  async close(): Promise<void> {
    const context = this.context;
    this.context = undefined;
    await context?.close();
  }
}

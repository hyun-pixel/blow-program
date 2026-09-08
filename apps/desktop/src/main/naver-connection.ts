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
} from 'playwright-core';

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
      );
    } catch (error) {
      throw new NaverConnectionRunnerError(classifyFailure(error), {
        cause: error,
      });
    }
  }

  async saveDraft(): Promise<NaverDraftSaveResult> {
    const content = this.enteredContent;

    if (!content) {
      throw new NaverConnectionRunnerError({
        code: 'CONTENT_INPUT_REQUIRED',
        message: '먼저 제목과 본문 입력을 완료해 주세요.',
      });
    }

    try {
      return await this.adapter.saveDraft(this.profile, content);
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

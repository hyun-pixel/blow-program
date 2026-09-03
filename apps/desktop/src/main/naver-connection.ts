import { mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';
import {
  NaverConnectionAdapter,
  NaverConnectionError,
  parseNaverBlogUrl,
  type NaverBlogProfile,
  type NaverConnectionStatus,
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
  | 'WRITER_LINK_NOT_FOUND'
  | 'WRITER_LINK_AMBIGUOUS'
  | 'WRITER_NOT_READY'
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
  if (error instanceof NaverConnectionError) {
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
      const status = await this.adapter.verifyRegisteredBlog(this.profile);
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

  async bringToFront(): Promise<void> {
    await this.adapter.bringToFront();
  }

  async close(): Promise<void> {
    const context = this.context;
    this.context = undefined;
    await context?.close();
  }
}

import { execFileSync } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { mkdir, stat, unlink, writeFile } from 'node:fs/promises';
import { basename, extname, join, resolve } from 'node:path';
import {
  app,
  BrowserWindow,
  dialog,
  ipcMain,
  safeStorage,
  screen,
  type IpcMainInvokeEvent,
  type OpenDialogOptions,
  type WebContents,
} from 'electron';

import type {
  DraftContent,
  NaverDividerPosition,
  NaverDividerStyleSelection,
  NaverImageLayout,
  NaverQuotePosition,
  NaverQuoteStyleSelection,
  NaverStickerPosition,
  NaverUserInteractionResult,
} from '@blow/naver-adapter';
import {
  MockPocError,
  runMockPoc,
  type MockPocResult,
} from './mock-poc.js';
import {
  classifyNaverFailure,
  NaverConnectionRunnerError,
  NaverConnectionSession,
} from './naver-connection.js';
import { prepareAutomationFocus } from './automation-focus.js';
import {
  readOpenAiCredential,
  listOpenAiModelIds,
  readOpenAiCredentialStatus,
  removeOpenAiCredential,
  saveOpenAiCredential,
  testOpenAiConnection,
} from './openai-credential.js';
import {
  generateOpenAiBlogDraft,
  normalizeBlogGenerationRequest,
} from './openai-generation.js';
import { recommendOpenAiTopics, normalizeTopicRecommendationRequest } from './openai-topic-recommendation.js';
import {
  decodeGeneratedBlogImageDataUrl,
  generateOpenAiBlogImages,
  normalizeBlogImageGenerationRequest,
} from './openai-image-generation.js';
import {
  normalizeBrandProfileUserId,
  readBrandProfile,
  saveBrandProfile,
  saveBrandProfileProducts,
} from './brand-profile.js';
import {
  completePendingGeneratedImages,
  discardPendingGeneratedImages,
  pruneGeneratedImages,
} from './generated-image-storage.js';
import {
  addWorkHistoryEntry,
  deleteWorkHistoryEntry,
  readWorkHistory,
} from './work-history.js';
import {
  getWindowsDisplayName,
  toDisplayScalePercent,
  type CompatibilityEnvironmentResult,
  type WriterNavigationRepeatProgress,
} from '../shared/compatibility-environment.js';

const isDevelopment = process.env.NODE_ENV !== 'production';

if (process.platform === 'win32') {
  app.setAppUserModelId('com.blow.desktop');
}

const ipcChannels = {
  systemAppVersion: 'system:app-version',
  systemDeviceHash: 'system:device-hash',
  openAiCredentialStatus: 'openai:credential-status',
  openAiCredentialSave: 'openai:credential-save',
  openAiCredentialRemove: 'openai:credential-remove',
  openAiConnectionTest: 'openai:connection-test',
  openAiRecommendTopics: 'openai:recommend-topics',
  openAiGenerateDraft: 'openai:generate-draft',
  openAiGenerateImages: 'openai:generate-images',
  openAiGenerationCancel: 'openai:generation-cancel',
  brandProfileGet: 'brand-profile:get',
  openAiModelList: 'openai:model-list',
  brandProfileSave: 'brand-profile:save',
  brandProfileProductsSave: 'brand-profile:products-save',
  workHistoryList: 'work-history:list',
  workHistoryAdd: 'work-history:add',
  workHistoryDelete: 'work-history:delete',
  workHistoryOpenDraft: 'work-history:open-draft',
  mockStart: 'poc:start',
  mockCloseBrowser: 'poc:close-browser',
  mockState: 'poc:state',
  naverOpen: 'naver:open',
  naverState: 'naver:state',
  naverVerify: 'naver:verify',
  naverOpenWriter: 'naver:open-writer',
  naverPrepareAutomaticWriter: 'naver:prepare-automatic-writer',
  naverEnterContent: 'naver:enter-content',
  naverListDividerStyles: 'naver:list-divider-styles',
  naverInsertDivider: 'naver:insert-divider',
  naverListQuoteStyles: 'naver:list-quote-styles',
  naverInsertQuote: 'naver:insert-quote',
  naverSaveDraft: 'naver:save-draft',
  naverListStickerCategories: 'naver:list-sticker-categories',
  naverInsertSticker: 'naver:insert-sticker',
  naverSelectImages: 'naver:select-images',
  naverPrepareGeneratedImages: 'naver:prepare-generated-images',
  naverAttachImages: 'naver:attach-images',
  naverMonitorUserInteraction: 'naver:monitor-user-interaction',
  naverTestNetworkInterruption: 'naver:test-network-interruption',
  naverTestStructureChange: 'naver:test-structure-change',
  naverForceExitTest: 'naver:force-exit-test',
  naverInspectCompatibilityEnvironment: 'naver:inspect-compatibility-environment',
  naverTestWriterNavigationRepeat: 'naver:test-writer-navigation-repeat',
  naverWriterNavigationProgress: 'naver:writer-navigation-progress',
  naverTestSlowNetwork: 'naver:test-slow-network',
  naverClose: 'naver:close',
  naverFocus: 'naver:focus',
} as const;

let mainWindow: BrowserWindow | null = null;
let activeRun = false;
let activeMockResult: MockPocResult | null = null;
let activeNaverSession: NaverConnectionSession | null = null;
let naverStopVersion = 0;
const selectedNaverImages = new Map<
  string,
  { readonly path: string; readonly name: string; readonly sizeBytes: number }
>();
let naverWatchVersion = 0;
let activeOpenAiGeneration: AbortController | null = null;
let quitting = false;

function isTrustedSender(event: IpcMainInvokeEvent): boolean {
  const senderFrame = event.senderFrame;

  if (!senderFrame) {
    return false;
  }

  const senderUrl = senderFrame.url;

  try {
    const url = new URL(senderUrl);

    if (url.protocol === 'file:') {
      return true;
    }

    return (
      isDevelopment &&
      url.protocol === 'http:' &&
      (url.hostname === 'localhost' || url.hostname === '127.0.0.1')
    );
  } catch {
    return false;
  }
}

function requireTrustedSender(event: IpcMainInvokeEvent): void {
  if (!isTrustedSender(event)) {
    throw new Error('허용되지 않은 화면에서 보낸 요청입니다.');
  }
}

function getWindowsDeviceHash(): string {
  if (process.platform !== 'win32') {
    throw new Error('Windows에서만 기기를 등록할 수 있습니다.');
  }

  const regPath = join(
    process.env.SystemRoot ?? 'C:\\Windows',
    'System32',
    'reg.exe',
  );
  const output = execFileSync(
    regPath,
    [
      'query',
      'HKLM\\SOFTWARE\\Microsoft\\Cryptography',
      '/v',
      'MachineGuid',
    ],
    { encoding: 'utf8', windowsHide: true },
  );
  const machineGuid = output.match(
    /MachineGuid\s+REG_SZ\s+([^\r\n]+)/i,
  )?.[1]?.trim();

  if (!machineGuid) {
    throw new Error('Windows 기기 식별값을 확인하지 못했습니다.');
  }

  return createHash('sha256')
    .update(`blow-device-v1:${machineGuid.toLowerCase()}`)
    .digest('hex');
}

function getOpenAiCredentialPath(): string {
  return join(
    process.env.LOCALAPPDATA ?? app.getPath('userData'),
    'BLOW',
    'Secure',
    'openai-api-key.bin',
  );
}

function getBrandProfilePath(input: unknown): string {
  const userId = normalizeBrandProfileUserId(input);

  return join(
    process.env.LOCALAPPDATA ?? app.getPath('userData'),
    'BLOW',
    'Profiles',
    userId,
    'brand-profile.json',
  );
}

function getWorkHistoryPath(input: unknown): string {
  const userId = normalizeBrandProfileUserId(input);

  return join(
    process.env.LOCALAPPDATA ?? app.getPath('userData'),
    'BLOW',
    'Profiles',
    userId,
    'work-history.json',
  );
}

function getGeneratedImagesDirectory(): string {
  return join(
    process.env.LOCALAPPDATA ?? app.getPath('userData'),
    'BLOW',
    'GeneratedImages',
  );
}

function getPendingGeneratedImagesDirectory(): string {
  return join(getGeneratedImagesDirectory(), 'Pending');
}

async function prepareGeneratedNaverImages(input: unknown): Promise<readonly {
  readonly id: string;
  readonly path: string;
  readonly name: string;
  readonly sizeBytes: number;
}[]> {
  if (!Array.isArray(input) || input.length < 1 || input.length > 4) {
    throw new Error('INVALID_GENERATED_IMAGES');
  }

  const images = input.map(decodeGeneratedBlogImageDataUrl);
  const directory = getPendingGeneratedImagesDirectory();
  const writtenPaths: string[] = [];

  await discardPendingGeneratedImages(directory);
  await mkdir(directory, { recursive: true });

  try {
    const prepared = [];

    for (const [index, image] of images.entries()) {
      const id = randomUUID();
      const path = join(directory, `${id}.jpg`);

      await writeFile(path, image, { flag: 'wx' });
      writtenPaths.push(path);
      prepared.push({
        id,
        path,
        name: `BLOW 생성 이미지 ${index + 1}.jpg`,
        sizeBytes: image.length,
      });
    }

    return prepared;
  } catch (error) {
    await Promise.allSettled(writtenPaths.map((path) => unlink(path)));
    throw error;
  }
}

function getPocPaths(): {
  profilePath: string;
  mockEditorPath: string;
} {
  const localRoot = resolve(
    process.env.LOCALAPPDATA ?? app.getPath('userData'),
    'BLOW',
  );
  const profilePath = resolve(localRoot, 'ChromeProfile');

  if (!profilePath.startsWith(localRoot)) {
    throw new Error('전용 Chrome 프로필 경로가 올바르지 않습니다.');
  }

  return {
    profilePath,
    mockEditorPath: join(__dirname, '../../resources/mock-editor.html'),
  };
}

function requireBlogUrl(input: unknown): string {
  if (typeof input !== 'string' || input.length > 2_048) {
    return '';
  }

  return input;
}

function parseDraftContent(input: unknown): DraftContent | null {
  if (!input || typeof input !== 'object') {
    return null;
  }

  const candidate = input as {
    readonly title?: unknown;
    readonly paragraphs?: unknown;
  };

  if (
    typeof candidate.title !== 'string' ||
    !Array.isArray(candidate.paragraphs) ||
    !candidate.paragraphs.every((paragraph) => typeof paragraph === 'string')
  ) {
    return null;
  }

  return {
    title: candidate.title,
    paragraphs: candidate.paragraphs,
  };
}

const dividerStyleSelections = new Set<NaverDividerStyleSelection>([
  'random',
  'default',
  'line1',
  'line2',
  'line3',
  'line4',
  'line5',
  'line6',
  'line7',
]);

function parseDividerRequest(input: unknown): {
  readonly paragraphNumber: number;
  readonly position: NaverDividerPosition;
  readonly styleSelection?: NaverDividerStyleSelection;
} | null {
  if (!input || typeof input !== 'object') {
    return null;
  }

  const candidate = input as {
    readonly paragraphNumber?: unknown;
    readonly position?: unknown;
    readonly styleSelection?: unknown;
  };
  const styleSelection = candidate.styleSelection;

  if (
    !Number.isInteger(candidate.paragraphNumber) ||
    (candidate.paragraphNumber as number) < 1 ||
    (candidate.paragraphNumber as number) > 100 ||
    (candidate.position !== 'before' && candidate.position !== 'after') ||
    (
      styleSelection !== undefined &&
      (
        typeof styleSelection !== 'string' ||
        !dividerStyleSelections.has(
          styleSelection as NaverDividerStyleSelection,
        )
      )
    )
  ) {
    return null;
  }

  return {
    paragraphNumber: candidate.paragraphNumber as number,
    position: candidate.position,
    ...(styleSelection === undefined
      ? {}
      : {
          styleSelection:
            styleSelection as NaverDividerStyleSelection,
        }),
  };
}

function parseStickerRequest(input: unknown): {
  readonly paragraphNumber: number;
  readonly position: NaverStickerPosition;
  readonly categoryId: string;
} | null {
  const location = parseDividerRequest(input);

  if (!location || !input || typeof input !== 'object') {
    return null;
  }

  const categoryId = (input as { readonly categoryId?: unknown }).categoryId;

  if (
    typeof categoryId !== 'string' ||
    categoryId.length < 1 ||
    categoryId.length > 2_048
  ) {
    return null;
  }

  return {
    ...location,
    categoryId,
  };
}

const quoteStyleSelections = new Set<NaverQuoteStyleSelection>([
  'random',
  'default',
  'quotation_line',
  'quotation_bubble',
  'quotation_underline',
  'quotation_postit',
  'quotation_corner',
]);

function parseQuoteRequest(input: unknown): {
  readonly paragraphNumber: number;
  readonly position: NaverQuotePosition;
  readonly styleSelection?: NaverQuoteStyleSelection;
} | null {
  if (!input || typeof input !== 'object') {
    return null;
  }

  const candidate = input as {
    readonly paragraphNumber?: unknown;
    readonly position?: unknown;
    readonly styleSelection?: unknown;
  };
  const styleSelection = candidate.styleSelection;

  if (
    !Number.isInteger(candidate.paragraphNumber) ||
    (candidate.paragraphNumber as number) < 1 ||
    (candidate.paragraphNumber as number) > 100 ||
    (candidate.position !== 'before' && candidate.position !== 'after') ||
    (
      styleSelection !== undefined &&
      (
        typeof styleSelection !== 'string' ||
        !quoteStyleSelections.has(
          styleSelection as NaverQuoteStyleSelection,
        )
      )
    )
  ) {
    return null;
  }

  return {
    paragraphNumber: candidate.paragraphNumber as number,
    position: candidate.position,
    ...(styleSelection === undefined
      ? {}
      : {
          styleSelection:
            styleSelection as NaverQuoteStyleSelection,
        }),
  };
}

function parseSelectedImageIds(input: unknown): readonly string[] | null {
  if (
    !Array.isArray(input) ||
    input.length === 0 ||
    !input.every((id) => typeof id === 'string' && id.length <= 64)
  ) {
    return null;
  }

  const uniqueIds = new Set(input);
  return uniqueIds.size === input.length ? input : null;
}

function parseImageAttachmentRequest(input: unknown): {
  readonly imageIds: readonly string[];
  readonly layout: NaverImageLayout;
  readonly paragraphNumbers?: readonly number[];
} | null {
  if (!input || typeof input !== 'object') {
    return null;
  }

  const candidate = input as {
    readonly imageIds?: unknown;
    readonly layout?: unknown;
    readonly paragraphNumbers?: unknown;
  };
  const imageIds = parseSelectedImageIds(candidate.imageIds);
  const layout = candidate.layout;

  if (
    !imageIds ||
    (layout !== 'individual' && layout !== 'collage' && layout !== 'slide')
  ) {
    return null;
  }

  const paragraphNumbers = candidate.paragraphNumbers;
  if (paragraphNumbers !== undefined && (layout !== 'individual' || !Array.isArray(paragraphNumbers) || paragraphNumbers.length !== imageIds.length || paragraphNumbers.some(number => !Number.isInteger(number) || number < 1 || number > 100))) return null;
  return { imageIds, layout, ...(paragraphNumbers === undefined ? {} : { paragraphNumbers: paragraphNumbers as number[] }) };
}

async function closeMockBrowser(): Promise<void> {
  const result = activeMockResult;
  activeMockResult = null;
  await result?.closeBrowser();
}

async function closeNaverBrowser(): Promise<void> {
  const session = activeNaverSession;
  naverWatchVersion += 1;
  activeNaverSession = null;
  selectedNaverImages.clear();
  await session?.close();
}

async function waitForNaverRunToSettle(): Promise<void> {
  const timeoutAt = Date.now() + 30_000;

  while (activeRun && Date.now() < timeoutAt) {
    await new Promise((resolve) => setTimeout(resolve, 50));
  }

  if (activeRun) {
    throw new Error('Timed out while stopping the active Naver operation.');
  }
}

async function closeAllBrowsers(): Promise<void> {
  await Promise.all([
    closeMockBrowser(),
    closeNaverBrowser(),
  ]);
}

function busyResponse(): {
  readonly ok: false;
  readonly error: {
    readonly code: 'POC_ALREADY_RUNNING';
    readonly message: string;
  };
} {
  return {
    ok: false,
    error: {
      code: 'POC_ALREADY_RUNNING',
      message: 'Chrome 확인 작업이 이미 진행 중입니다.',
    },
  };
}

function registerMockIpc(): void {
  ipcMain.handle(ipcChannels.mockStart, async (event) => {
    requireTrustedSender(event);

    if (activeRun) {
      return busyResponse();
    }

    activeRun = true;
    await closeAllBrowsers();

    try {
      const paths = getPocPaths();
      activeMockResult = await runMockPoc({
        ...paths,
        headless: false,
        keepBrowserOpen: true,
        onSnapshot: (snapshot) => {
          if (!event.sender.isDestroyed()) {
            event.sender.send(ipcChannels.mockState, snapshot);
          }
        },
      });

      return {
        ok: true,
        snapshot: activeMockResult.snapshot,
        verification: activeMockResult.verification,
      };
    } catch (error) {
      if (error instanceof MockPocError) {
        return {
          ok: false,
          snapshot: error.snapshot,
          error: error.failure,
        };
      }

      return {
        ok: false,
        error: {
          code: 'POC_FAILED',
          message: '자동 입력 테스트를 완료하지 못했습니다. 다시 시도해 주세요.',
        },
      };
    } finally {
      activeRun = false;
    }
  });

  ipcMain.handle(ipcChannels.mockCloseBrowser, async (event) => {
    requireTrustedSender(event);
    await closeMockBrowser();
    return { ok: true };
  });
}

function trackNaverSession(session: NaverConnectionSession, sender: WebContents): void {
  activeNaverSession = session;
  session.onDisconnected(() => {
    if (activeNaverSession !== session) return;
    activeNaverSession = null;
    naverWatchVersion += 1;
    selectedNaverImages.clear();
    if (!sender.isDestroyed()) sender.send(ipcChannels.naverState, {
      ok: false, error: classifyNaverFailure(new Error('Browser closed')),
    });
  });
  if (!session.isConnected()) throw new NaverConnectionRunnerError(classifyNaverFailure(new Error('Browser closed')));
}

function startNaverAutoVerify(
  session: NaverConnectionSession,
  sender: WebContents,
): void {
  const watchVersion = ++naverWatchVersion;

  setTimeout(() => {
    if (
      watchVersion !== naverWatchVersion ||
      session !== activeNaverSession
    ) {
      return;
    }

    const verification = session.waitForLoginAndVerify();

    void verification
      .then((status) => {
        if (
          watchVersion === naverWatchVersion &&
          session === activeNaverSession &&
          !sender.isDestroyed()
        ) {
          sender.send(ipcChannels.naverState, {
            ok: true,
            status,
          });
        }
      })
      .catch((error: unknown) => {
        if (
          watchVersion !== naverWatchVersion ||
          session !== activeNaverSession ||
          sender.isDestroyed()
        ) {
          return;
        }

        const failure = error instanceof NaverConnectionRunnerError
          ? error.failure
          : {
              code: 'NAVER_CONNECTION_FAILED',
              message: '네이버 연결 상태를 자동으로 확인하지 못했습니다. 다시 시도해 주세요.',
            };

        if (failure.code === 'BROWSER_CLOSED') {
          activeNaverSession = null;
        }

        sender.send(ipcChannels.naverState, {
          ok: false,
          error: failure,
        });
      });
  }, 0);
}

function registerNaverIpc(): void {
  ipcMain.handle(ipcChannels.naverOpen, async (event, input: unknown) => {
    requireTrustedSender(event);

    if (activeRun) {
      return busyResponse();
    }

    activeRun = true;
    const stopVersion = naverStopVersion;
    await closeAllBrowsers();

    try {
      const { profilePath } = getPocPaths();
      const result = await NaverConnectionSession.create({
        profilePath,
        blogUrl: requireBlogUrl(input),
        headless: false,
      });

      if (stopVersion !== naverStopVersion) {
        await result.session.close();
        return {
          ok: false,
          error: {
            code: 'AUTOMATION_STOPPED',
            message: '작업을 중단했습니다.',
          },
        };
      }

      trackNaverSession(result.session, event.sender);

      if (
        result.status.stage === 'LOGIN_REQUIRED' ||
        result.status.stage === 'HOME_READY'
      ) {
        startNaverAutoVerify(result.session, event.sender);
      }

      return {
        ok: true,
        status: result.status,
      };
    } catch (error) {
      if (error instanceof NaverConnectionRunnerError) {
        if (error.failure.code === 'BROWSER_CLOSED') {
          activeNaverSession = null;
        }

        return {
          ok: false,
          error: error.failure,
        };
      }

      return {
        ok: false,
        error: {
          code: 'NAVER_CONNECTION_FAILED',
          message: '네이버 연결 상태를 확인하지 못했습니다. 다시 시도해 주세요.',
        },
      };
    } finally {
      activeRun = false;
    }
  });

  ipcMain.handle(ipcChannels.naverVerify, async (event) => {
    requireTrustedSender(event);

    if (activeRun) {
      return busyResponse();
    }

    const session = activeNaverSession;

    if (!session) {
      return {
        ok: false,
        error: {
          code: 'NAVER_SESSION_NOT_FOUND',
          message: '전용 Chrome을 먼저 열어 주세요.',
        },
      };
    }

    naverWatchVersion += 1;
    activeRun = true;

    try {
      return {
        ok: true,
        status: await session.verify(),
      };
    } catch (error) {
      if (error instanceof NaverConnectionRunnerError) {
        if (error.failure.code === 'BROWSER_CLOSED') {
          activeNaverSession = null;
        }

        return {
          ok: false,
          error: error.failure,
        };
      }

      return {
        ok: false,
        error: {
          code: 'NAVER_CONNECTION_FAILED',
          message: '네이버 연결 상태를 확인하지 못했습니다. 다시 시도해 주세요.',
        },
      };
    } finally {
      activeRun = false;
    }
  });

  ipcMain.handle(ipcChannels.naverPrepareAutomaticWriter, async (event, blogId: unknown) => {
    requireTrustedSender(event);
    if (activeRun) return busyResponse();
    const session = activeNaverSession;
    const appWindow = BrowserWindow.fromWebContents(event.sender);
    if (!session || !session.isConnected()) {
      const error = classifyNaverFailure(new Error('Browser closed'));
      event.sender.send(ipcChannels.naverState, { ok: false, error });
      return { ok: false, error };
    }
    if (typeof blogId !== 'string' || blogId !== session.profile.blogId) {
      return { ok: false, error: { code: 'WRITER_NOT_READY', message: '블로그 세팅에서 저장할 네이버 블로그를 다시 연결해 주세요.' } };
    }
    if (!appWindow || appWindow.isDestroyed() || !appWindow.isFocused()) {
      return { ok: false, error: { code: 'USER_INTERACTION_DETECTED', message: 'BLOW 창을 맨 앞으로 두고 다시 시작해 주세요.' } };
    }
    naverWatchVersion += 1;
    activeRun = true;
    try {
      const status = await session.prepareAutomaticWriter(blogId);
      if (status.stage !== 'WRITER_READY') {
        event.sender.send(ipcChannels.naverState, { ok: true, status });
        if (status.stage === 'LOGIN_REQUIRED') startNaverAutoVerify(session, event.sender);
        return { ok: true, status };
      }
      // Confirm focus before reporting ready, so generation does not start after a refused focus change.
      if (!await prepareAutomationFocus(appWindow)) return { ok: false, error: { code: 'USER_INTERACTION_DETECTED', message: 'BLOW 창을 맨 앞으로 두고 다시 시작해 주세요.' } };
      return { ok: true, status };
    } catch (error) {
      const failure = error instanceof NaverConnectionRunnerError
        ? error.failure : { code: 'WRITER_NOT_READY', message: '새 글쓰기 화면을 준비하지 못했습니다. 네이버 연결을 확인해 주세요. [WRITER_NOT_READY]' };
      if (['BROWSER_CLOSED', 'NAVER_TAB_CLOSED', 'NAVER_AUTH_REQUIRED'].includes(failure.code)) {
        event.sender.send(ipcChannels.naverState, { ok: false, error: failure });
      }
      return { ok: false, error: failure };
    } finally {
      activeRun = false;
    }
  });

  ipcMain.handle(ipcChannels.naverOpenWriter, async (event) => {
    requireTrustedSender(event);

    if (activeRun) {
      return busyResponse();
    }

    const session = activeNaverSession;

    if (!session) {
      return {
        ok: false,
        error: {
          code: 'NAVER_SESSION_NOT_FOUND',
          message: '전용 Chrome을 먼저 열어 주세요.',
        },
      };
    }

    naverWatchVersion += 1;
    activeRun = true;

    try {
      return {
        ok: true,
        status: await session.openWriter(),
      };
    } catch (error) {
      if (error instanceof NaverConnectionRunnerError) {
        if (error.failure.code === 'BROWSER_CLOSED') {
          activeNaverSession = null;
        }

        return {
          ok: false,
          error: error.failure,
        };
      }

      return {
        ok: false,
        error: {
          code: 'NAVER_CONNECTION_FAILED',
          message: '글쓰기 화면 진입을 확인하지 못했습니다. 다시 시도해 주세요.',
        },
      };
    } finally {
      activeRun = false;
    }
  });

  ipcMain.handle(
    ipcChannels.naverEnterContent,
    async (event, input: unknown) => {
      requireTrustedSender(event);

      if (activeRun) {
        return busyResponse();
      }

      const session = activeNaverSession;
      const content = parseDraftContent(input);

      if (!session) {
        return {
          ok: false,
          error: {
            code: 'NAVER_SESSION_NOT_FOUND',
            message: '전용 Chrome을 먼저 열어 주세요.',
          },
        };
      }

      if (!content) {
        return {
          ok: false,
          error: {
            code: 'INVALID_DRAFT_CONTENT',
            message: '입력할 제목과 본문 형식을 확인해 주세요.',
          },
        };
      }

      naverWatchVersion += 1;
      activeRun = true;

      const appWindow = BrowserWindow.fromWebContents(event.sender);
      const inputAbortController = new AbortController();
      let userLeftApp = !await prepareAutomationFocus(appWindow);
      const recordAppBlur = (): void => {
        userLeftApp = true;
        inputAbortController.abort();
      };
      const userInteractionResponse = () => {
        if (appWindow && !appWindow.isDestroyed()) {
          appWindow.show();
          appWindow.focus();
        }

        return {
          ok: false as const,
          error: {
            code: 'USER_INTERACTION_DETECTED',
            message: '자동 입력 중 BLOW 화면을 벗어난 것을 감지해 안전하게 멈췄습니다. 현재 단계를 다시 실행하지 말고 Chrome에서 결과를 확인한 뒤 작업 중단으로 새 작업을 시작해 주세요.',
          },
        };
      };

      if (appWindow && !appWindow.isDestroyed()) {
        appWindow.on('blur', recordAppBlur);
      }

      try {
        if (userLeftApp) {
          return userInteractionResponse();
        }

        await new Promise((resolve) => setTimeout(resolve, 2_000));

        if (userLeftApp) {
          return userInteractionResponse();
        }

        const result = await session.enterContent(
          content,
          inputAbortController.signal,
        );

        if (userLeftApp) {
          return userInteractionResponse();
        }

        return {
          ok: true,
          result,
        };
      } catch (error) {
        if (error instanceof NaverConnectionRunnerError) {
          if (error.failure.code === 'BROWSER_CLOSED') {
            activeNaverSession = null;
          }

          if (userLeftApp) {
            return userInteractionResponse();
          }

          return {
            ok: false,
            error: error.failure,
          };
        }

        if (userLeftApp) {
          return userInteractionResponse();
        }

        return {
          ok: false,
          error: {
            code: 'NAVER_CONNECTION_FAILED',
            message: '제목과 본문 입력을 완료하지 못했습니다. Chrome 화면을 확인해 주세요.',
          },
        };
      } finally {
        if (appWindow && !appWindow.isDestroyed()) {
          appWindow.off('blur', recordAppBlur);
        }

        activeRun = false;
      }
    },
  );

  ipcMain.handle(
    ipcChannels.naverListDividerStyles,
    async (event, input: unknown) => {
      requireTrustedSender(event);

      if (activeRun) {
        return busyResponse();
      }

      const session = activeNaverSession;
      const request = parseDividerRequest(input);

      if (!session) {
        return {
          ok: false,
          error: {
            code: 'NAVER_SESSION_NOT_FOUND',
            message: '전용 Chrome을 먼저 열어 주세요.',
          },
        };
      }

      if (!request) {
        return {
          ok: false,
          error: {
            code: 'INVALID_DIVIDER_REQUEST',
            message: '구분선을 넣을 문단과 위치를 다시 선택해 주세요.',
          },
        };
      }

      activeRun = true;

      const appWindow = BrowserWindow.fromWebContents(event.sender);
      const dividerAbortController = new AbortController();
      let userLeftApp = !await prepareAutomationFocus(appWindow);
      const recordAppBlur = (): void => {
        userLeftApp = true;
        dividerAbortController.abort();
      };
      const userInteractionResponse = () => {
        if (appWindow && !appWindow.isDestroyed()) {
          appWindow.show();
          appWindow.focus();
        }

        return {
          ok: false as const,
          error: {
            code: 'USER_INTERACTION_DETECTED',
            message: '구분선 디자인 확인 중 BLOW 화면을 벗어난 것을 감지해 남은 작업을 멈췄습니다. 자동으로 다시 실행하지 말고 Chrome에서 결과를 확인한 뒤 작업 중단으로 새 작업을 시작해 주세요.',
          },
        };
      };

      if (appWindow && !appWindow.isDestroyed()) {
        appWindow.on('blur', recordAppBlur);
      }

      try {
        if (userLeftApp) {
          return userInteractionResponse();
        }

        await new Promise((resolve) => setTimeout(resolve, 2_000));

        if (userLeftApp) {
          return userInteractionResponse();
        }

        const result = await session.listDividerStyles(
          request.paragraphNumber,
          request.position,
          dividerAbortController.signal,
        );

        if (userLeftApp) {
          return userInteractionResponse();
        }

        return {
          ok: true,
          result,
        };
      } catch (error) {
        if (error instanceof NaverConnectionRunnerError) {
          if (error.failure.code === 'BROWSER_CLOSED') {
            activeNaverSession = null;
          }

          if (userLeftApp) {
            return userInteractionResponse();
          }

          return {
            ok: false,
            error: error.failure,
          };
        }

        if (userLeftApp) {
          return userInteractionResponse();
        }

        return {
          ok: false,
          error: {
            code: 'DIVIDER_STYLE_NOT_FOUND',
            message: '구분선 디자인을 불러오지 못했습니다. Chrome 화면을 확인해 주세요.',
          },
        };
      } finally {
        if (appWindow && !appWindow.isDestroyed()) {
          appWindow.off('blur', recordAppBlur);
        }

        activeRun = false;
      }
    },
  );

  ipcMain.handle(
    ipcChannels.naverInsertDivider,
    async (event, input: unknown) => {
      requireTrustedSender(event);

      if (activeRun) {
        return busyResponse();
      }

      const session = activeNaverSession;
      const request = parseDividerRequest(input);

      if (!session) {
        return {
          ok: false,
          error: {
            code: 'NAVER_SESSION_NOT_FOUND',
            message: '전용 Chrome을 먼저 열어 주세요.',
          },
        };
      }

      if (!request) {
        return {
          ok: false,
          error: {
            code: 'INVALID_DIVIDER_REQUEST',
            message: '구분선을 넣을 문단과 위치를 다시 선택해 주세요.',
          },
        };
      }

      activeRun = true;

      const appWindow = BrowserWindow.fromWebContents(event.sender);
      const dividerAbortController = new AbortController();
      let userLeftApp = !await prepareAutomationFocus(appWindow);
      const recordAppBlur = (): void => {
        userLeftApp = true;
        dividerAbortController.abort();
      };
      const userInteractionResponse = () => {
        if (appWindow && !appWindow.isDestroyed()) {
          appWindow.show();
          appWindow.focus();
        }

        return {
          ok: false as const,
          error: {
            code: 'USER_INTERACTION_DETECTED',
            message: '구분선 삽입 중 BLOW 화면을 벗어난 것을 감지해 남은 작업을 멈췄습니다. 자동으로 다시 삽입하지 말고 Chrome에서 결과를 확인한 뒤 작업 중단으로 새 작업을 시작해 주세요.',
          },
        };
      };

      if (appWindow && !appWindow.isDestroyed()) {
        appWindow.on('blur', recordAppBlur);
      }

      try {
        if (userLeftApp) {
          return userInteractionResponse();
        }

        await new Promise((resolve) => setTimeout(resolve, 2_000));

        if (userLeftApp) {
          return userInteractionResponse();
        }

        const result = await session.insertDivider(
          request.paragraphNumber,
          request.position,
          request.styleSelection,
          dividerAbortController.signal,
        );

        if (userLeftApp) {
          return userInteractionResponse();
        }

        return {
          ok: true,
          result,
        };
      } catch (error) {
        if (error instanceof NaverConnectionRunnerError) {
          if (error.failure.code === 'BROWSER_CLOSED') {
            activeNaverSession = null;
          }

          if (userLeftApp) {
            return userInteractionResponse();
          }

          return {
            ok: false,
            error: error.failure,
          };
        }

        if (userLeftApp) {
          return userInteractionResponse();
        }

        return {
          ok: false,
          error: {
            code: 'DIVIDER_INSERT_UNCONFIRMED',
            message: '구분선 삽입을 완료하지 못했습니다. Chrome 화면을 확인해 주세요.',
          },
        };
      } finally {
        if (appWindow && !appWindow.isDestroyed()) {
          appWindow.off('blur', recordAppBlur);
        }

        activeRun = false;
      }
    },
  );

  ipcMain.handle(
    ipcChannels.naverListStickerCategories,
    async (event, input: unknown) => {
      requireTrustedSender(event);

      if (activeRun) {
        return busyResponse();
      }

      const session = activeNaverSession;
      const request = parseDividerRequest(input);

      if (!session) {
        return {
          ok: false,
          error: {
            code: 'NAVER_SESSION_NOT_FOUND',
            message: '전용 Chrome을 먼저 열어 주세요.',
          },
        };
      }

      if (!request) {
        return {
          ok: false,
          error: {
            code: 'INVALID_STICKER_REQUEST',
            message: '스티커를 넣을 문단과 위치를 다시 선택해 주세요.',
          },
        };
      }

      activeRun = true;

      const appWindow = BrowserWindow.fromWebContents(event.sender);
      const stickerAbortController = new AbortController();
      let userLeftApp = !await prepareAutomationFocus(appWindow);
      const recordAppBlur = (): void => {
        userLeftApp = true;
        stickerAbortController.abort();
      };
      const userInteractionResponse = () => {
        if (appWindow && !appWindow.isDestroyed()) {
          appWindow.show();
          appWindow.focus();
        }

        return {
          ok: false as const,
          error: {
            code: 'USER_INTERACTION_DETECTED',
            message: '스티커 묶음 확인 중 BLOW 화면을 벗어난 것을 감지해 남은 작업을 멈췄습니다. 자동으로 다시 실행하지 말고 Chrome에서 결과를 확인한 뒤 작업 중단으로 새 작업을 시작해 주세요.',
          },
        };
      };

      if (appWindow && !appWindow.isDestroyed()) {
        appWindow.on('blur', recordAppBlur);
      }

      try {
        if (userLeftApp) {
          return userInteractionResponse();
        }

        await new Promise((resolve) => setTimeout(resolve, 2_000));

        if (userLeftApp) {
          return userInteractionResponse();
        }

        const result = await session.listStickerCategories(
          request.paragraphNumber,
          request.position,
          stickerAbortController.signal,
        );

        if (userLeftApp) {
          return userInteractionResponse();
        }

        return {
          ok: true,
          result,
        };
      } catch (error) {
        if (error instanceof NaverConnectionRunnerError) {
          if (error.failure.code === 'BROWSER_CLOSED') {
            activeNaverSession = null;
          }

          if (userLeftApp) {
            return userInteractionResponse();
          }

          return {
            ok: false,
            error: error.failure,
          };
        }

        if (userLeftApp) {
          return userInteractionResponse();
        }

        return {
          ok: false,
          error: {
            code: 'STICKER_CATEGORY_NOT_FOUND',
            message: '스티커 묶음을 불러오지 못했습니다. Chrome 화면을 확인해 주세요.',
          },
        };
      } finally {
        if (appWindow && !appWindow.isDestroyed()) {
          appWindow.off('blur', recordAppBlur);
        }

        activeRun = false;
      }
    },
  );

  ipcMain.handle(
    ipcChannels.naverInsertSticker,
    async (event, input: unknown) => {
      requireTrustedSender(event);

      if (activeRun) {
        return busyResponse();
      }

      const session = activeNaverSession;
      const request = parseStickerRequest(input);

      if (!session) {
        return {
          ok: false,
          error: {
            code: 'NAVER_SESSION_NOT_FOUND',
            message: '전용 Chrome을 먼저 열어 주세요.',
          },
        };
      }

      if (!request) {
        return {
          ok: false,
          error: {
            code: 'INVALID_STICKER_REQUEST',
            message: '스티커를 넣을 문단·위치·묶음을 다시 선택해 주세요.',
          },
        };
      }

      activeRun = true;

      const appWindow = BrowserWindow.fromWebContents(event.sender);
      const stickerAbortController = new AbortController();
      let userLeftApp = !await prepareAutomationFocus(appWindow);
      const recordAppBlur = (): void => {
        userLeftApp = true;
        stickerAbortController.abort();
      };
      const userInteractionResponse = () => {
        if (appWindow && !appWindow.isDestroyed()) {
          appWindow.show();
          appWindow.focus();
        }

        return {
          ok: false as const,
          error: {
            code: 'USER_INTERACTION_DETECTED',
            message: '스티커 삽입 중 BLOW 화면을 벗어난 것을 감지해 남은 작업을 멈췄습니다. 자동으로 다시 삽입하지 말고 Chrome에서 결과를 확인한 뒤 작업 중단으로 새 작업을 시작해 주세요.',
          },
        };
      };

      if (appWindow && !appWindow.isDestroyed()) {
        appWindow.on('blur', recordAppBlur);
      }

      try {
        if (userLeftApp) {
          return userInteractionResponse();
        }

        await new Promise((resolve) => setTimeout(resolve, 2_000));

        if (userLeftApp) {
          return userInteractionResponse();
        }

        const result = await session.insertRandomSticker(
          request.paragraphNumber,
          request.position,
          request.categoryId,
          stickerAbortController.signal,
        );

        if (userLeftApp) {
          return userInteractionResponse();
        }

        return {
          ok: true,
          result,
        };
      } catch (error) {
        if (error instanceof NaverConnectionRunnerError) {
          if (error.failure.code === 'BROWSER_CLOSED') {
            activeNaverSession = null;
          }

          if (userLeftApp) {
            return userInteractionResponse();
          }

          return {
            ok: false,
            error: error.failure,
          };
        }

        if (userLeftApp) {
          return userInteractionResponse();
        }

        return {
          ok: false,
          error: {
            code: 'STICKER_INSERT_UNCONFIRMED',
            message: '스티커 삽입을 완료하지 못했습니다. Chrome 화면을 확인해 주세요.',
          },
        };
      } finally {
        if (appWindow && !appWindow.isDestroyed()) {
          appWindow.off('blur', recordAppBlur);
        }

        activeRun = false;
      }
    },
  );

  ipcMain.handle(
    ipcChannels.naverListQuoteStyles,
    async (event, input: unknown) => {
      requireTrustedSender(event);

      if (activeRun) {
        return busyResponse();
      }

      const session = activeNaverSession;
      const request = parseQuoteRequest(input);

      if (!session) {
        return {
          ok: false,
          error: {
            code: 'NAVER_SESSION_NOT_FOUND',
            message: '전용 Chrome을 먼저 열어 주세요.',
          },
        };
      }

      if (!request) {
        return {
          ok: false,
          error: {
            code: 'INVALID_QUOTE_REQUEST',
            message: '인용구를 넣을 문단과 위치를 다시 선택해 주세요.',
          },
        };
      }

      activeRun = true;

      const appWindow = BrowserWindow.fromWebContents(event.sender);
      const quoteAbortController = new AbortController();
      let userLeftApp = !await prepareAutomationFocus(appWindow);
      const recordAppBlur = (): void => {
        userLeftApp = true;
        quoteAbortController.abort();
      };
      const userInteractionResponse = () => {
        if (appWindow && !appWindow.isDestroyed()) {
          appWindow.show();
          appWindow.focus();
        }

        return {
          ok: false as const,
          error: {
            code: 'USER_INTERACTION_DETECTED',
            message: '인용구 디자인 확인 중 BLOW 화면을 벗어난 것을 감지해 남은 작업을 멈췄습니다. 자동으로 다시 실행하지 말고 Chrome에서 결과를 확인한 뒤 작업 중단으로 새 작업을 시작해 주세요.',
          },
        };
      };

      if (appWindow && !appWindow.isDestroyed()) {
        appWindow.on('blur', recordAppBlur);
      }

      try {
        if (userLeftApp) {
          return userInteractionResponse();
        }

        await new Promise((resolve) => setTimeout(resolve, 2_000));

        if (userLeftApp) {
          return userInteractionResponse();
        }

        const result = await session.listQuoteStyles(
          request.paragraphNumber,
          request.position,
          quoteAbortController.signal,
        );

        if (userLeftApp) {
          return userInteractionResponse();
        }

        return {
          ok: true,
          result,
        };
      } catch (error) {
        if (error instanceof NaverConnectionRunnerError) {
          if (error.failure.code === 'BROWSER_CLOSED') {
            activeNaverSession = null;
          }

          if (userLeftApp) {
            return userInteractionResponse();
          }

          return {
            ok: false,
            error: error.failure,
          };
        }

        if (userLeftApp) {
          return userInteractionResponse();
        }

        return {
          ok: false,
          error: {
            code: 'QUOTE_STYLE_NOT_FOUND',
            message: '인용구 디자인을 불러오지 못했습니다. Chrome 화면을 확인해 주세요.',
          },
        };
      } finally {
        if (appWindow && !appWindow.isDestroyed()) {
          appWindow.off('blur', recordAppBlur);
        }

        activeRun = false;
      }
    },
  );

  ipcMain.handle(
    ipcChannels.naverInsertQuote,
    async (event, input: unknown) => {
      requireTrustedSender(event);

      if (activeRun) {
        return busyResponse();
      }

      const session = activeNaverSession;
      const request = parseQuoteRequest(input);

      if (!session) {
        return {
          ok: false,
          error: {
            code: 'NAVER_SESSION_NOT_FOUND',
            message: '전용 Chrome을 먼저 열어 주세요.',
          },
        };
      }

      if (!request) {
        return {
          ok: false,
          error: {
            code: 'INVALID_QUOTE_REQUEST',
            message: '인용구를 넣을 문단과 위치를 다시 선택해 주세요.',
          },
        };
      }

      activeRun = true;

      const appWindow = BrowserWindow.fromWebContents(event.sender);
      const quoteAbortController = new AbortController();
      let userLeftApp = !await prepareAutomationFocus(appWindow);
      const recordAppBlur = (): void => {
        userLeftApp = true;
        quoteAbortController.abort();
      };
      const userInteractionResponse = () => {
        if (appWindow && !appWindow.isDestroyed()) {
          appWindow.show();
          appWindow.focus();
        }

        return {
          ok: false as const,
          error: {
            code: 'USER_INTERACTION_DETECTED',
            message: '인용구 삽입 중 BLOW 화면을 벗어난 것을 감지해 남은 작업을 멈췄습니다. 자동으로 다시 삽입하지 말고 Chrome에서 결과를 확인한 뒤 작업 중단으로 새 작업을 시작해 주세요.',
          },
        };
      };

      if (appWindow && !appWindow.isDestroyed()) {
        appWindow.on('blur', recordAppBlur);
      }

      try {
        if (userLeftApp) {
          return userInteractionResponse();
        }

        await new Promise((resolve) => setTimeout(resolve, 2_000));

        if (userLeftApp) {
          return userInteractionResponse();
        }

        const result = await session.insertQuote(
          request.paragraphNumber,
          request.position,
          request.styleSelection,
          quoteAbortController.signal,
        );

        if (userLeftApp) {
          return userInteractionResponse();
        }

        return {
          ok: true,
          result,
        };
      } catch (error) {
        if (error instanceof NaverConnectionRunnerError) {
          if (error.failure.code === 'BROWSER_CLOSED') {
            activeNaverSession = null;
          }

          if (userLeftApp) {
            return userInteractionResponse();
          }

          return {
            ok: false,
            error: error.failure,
          };
        }

        if (userLeftApp) {
          return userInteractionResponse();
        }

        return {
          ok: false,
          error: {
            code: 'QUOTE_INSERT_UNCONFIRMED',
            message: '인용구 삽입을 완료하지 못했습니다. Chrome 화면을 확인해 주세요.',
          },
        };
      } finally {
        if (appWindow && !appWindow.isDestroyed()) {
          appWindow.off('blur', recordAppBlur);
        }

        activeRun = false;
      }
    },
  );

  ipcMain.handle(ipcChannels.naverSaveDraft, async (event) => {
    requireTrustedSender(event);

    if (activeRun) {
      return busyResponse();
    }

    const session = activeNaverSession;

    if (!session) {
      return {
        ok: false,
        error: {
          code: 'NAVER_SESSION_NOT_FOUND',
          message: '전용 Chrome을 먼저 열어 주세요.',
        },
      };
    }

    activeRun = true;

    const appWindow = BrowserWindow.fromWebContents(event.sender);
    const draftSaveAbortController = new AbortController();
    let userLeftApp = !await prepareAutomationFocus(appWindow);
    const recordAppBlur = (): void => {
      userLeftApp = true;
      draftSaveAbortController.abort();
    };
    const userInteractionResponse = () => {
      if (appWindow && !appWindow.isDestroyed()) {
        appWindow.show();
        appWindow.focus();
      }

      return {
        ok: false as const,
        error: {
          code: 'USER_INTERACTION_DETECTED',
          message: '임시저장 실행 전에 BLOW 화면을 벗어난 것을 감지해 저장 버튼을 누르지 않고 멈췄습니다. 다시 실행하려면 작업 중단으로 새 작업을 시작해 주세요.',
        },
      };
    };

    if (appWindow && !appWindow.isDestroyed()) {
      appWindow.on('blur', recordAppBlur);
    }

    try {
      if (userLeftApp) {
        return userInteractionResponse();
      }

      await new Promise((resolve) => setTimeout(resolve, 2_000));

      if (userLeftApp) {
        return userInteractionResponse();
      }

      const result = await session.saveDraft(draftSaveAbortController.signal);
      await completePendingGeneratedImages(
        getPendingGeneratedImagesDirectory(),
        getGeneratedImagesDirectory(),
      ).catch(() => undefined);

      return {
        ok: true,
        result,
      };
    } catch (error) {
      if (error instanceof NaverConnectionRunnerError) {
        if (error.failure.code === 'BROWSER_CLOSED') {
          activeNaverSession = null;
        }

        if (
          userLeftApp &&
          error.failure.code === 'DRAFT_SAVE_OPERATION_INTERRUPTED'
        ) {
          return userInteractionResponse();
        }

        return {
          ok: false,
          error: error.failure,
        };
      }

      return {
        ok: false,
        error: {
          code: 'DRAFT_SAVE_UNCONFIRMED',
          message: '임시저장 완료 상태를 확인하지 못했습니다. Chrome에서 저장 여부를 확인해 주세요.',
        },
      };
    } finally {
      if (appWindow && !appWindow.isDestroyed()) {
        appWindow.off('blur', recordAppBlur);
      }

      activeRun = false;
    }
  });

  ipcMain.handle(ipcChannels.naverSelectImages, async (event) => {
    requireTrustedSender(event);

    if (!activeNaverSession) {
      return {
        ok: false,
        error: {
          code: 'NAVER_SESSION_NOT_FOUND',
          message: '전용 Chrome을 먼저 열어 주세요.',
        },
      };
    }

    const options: OpenDialogOptions = {
      title: '네이버 블로그에 첨부할 이미지 선택',
      buttonLabel: '이미지 선택',
      properties: ['openFile', 'multiSelections'],
      filters: [
        {
          name: '이미지 파일',
          extensions: ['jpg', 'jpeg', 'png'],
        },
      ],
    };
    const selection = mainWindow
      ? await dialog.showOpenDialog(mainWindow, options)
      : await dialog.showOpenDialog(options);

    if (selection.canceled) {
      return { ok: true, canceled: true, files: [] };
    }

    try {
      const nextImages = await Promise.all(
        selection.filePaths.map(async (filePath) => {
          const extension = extname(filePath).toLowerCase();

          if (!['.jpg', '.jpeg', '.png'].includes(extension)) {
            throw new Error('UNSUPPORTED_IMAGE_FORMAT');
          }

          const fileStat = await stat(filePath);

          if (!fileStat.isFile()) {
            throw new Error('IMAGE_FILE_NOT_FOUND');
          }

          return {
            id: randomUUID(),
            path: filePath,
            name: basename(filePath),
            sizeBytes: fileStat.size,
          };
        }),
      );

      selectedNaverImages.clear();

      for (const image of nextImages) {
        selectedNaverImages.set(image.id, {
          path: image.path,
          name: image.name,
          sizeBytes: image.sizeBytes,
        });
      }

      return {
        ok: true,
        canceled: false,
        files: nextImages.map(({ id, name, sizeBytes }) => ({
          id,
          name,
          sizeBytes,
        })),
      };
    } catch {
      return {
        ok: false,
        error: {
          code: 'INVALID_IMAGE_SELECTION',
          message: 'JPG 또는 PNG 이미지 파일을 다시 선택해 주세요.',
        },
      };
    }
  });

  ipcMain.handle(
    ipcChannels.naverPrepareGeneratedImages,
    async (event, input: unknown) => {
      requireTrustedSender(event);

      if (activeRun) {
        return busyResponse();
      }

      if (!activeNaverSession) {
        return {
          ok: false,
          error: {
            code: 'NAVER_SESSION_NOT_FOUND',
            message: '전용 Chrome을 먼저 열어 주세요.',
          },
        };
      }

      try {
        const images = await prepareGeneratedNaverImages(input);

        selectedNaverImages.clear();

        for (const image of images) {
          selectedNaverImages.set(image.id, {
            path: image.path,
            name: image.name,
            sizeBytes: image.sizeBytes,
          });
        }

        return {
          ok: true,
          canceled: false,
          files: images.map(({ id, name, sizeBytes }) => ({
            id,
            name,
            sizeBytes,
          })),
        };
      } catch {
        return {
          ok: false,
          error: {
            code: 'INVALID_IMAGE_SELECTION',
            message: '생성 이미지를 네이버 첨부용 파일로 준비하지 못했습니다.',
          },
        };
      }
    },
  );

  ipcMain.handle(
    ipcChannels.naverAttachImages,
    async (event, input: unknown) => {
      requireTrustedSender(event);

      if (activeRun) {
        return busyResponse();
      }

      const session = activeNaverSession;
      const request = parseImageAttachmentRequest(input);

      if (!session) {
        return {
          ok: false,
          error: {
            code: 'NAVER_SESSION_NOT_FOUND',
            message: '전용 Chrome을 먼저 열어 주세요.',
          },
        };
      }

      if (!request) {
        return {
          ok: false,
          error: {
            code: 'INVALID_IMAGE_SELECTION',
            message: '첨부할 이미지를 다시 선택해 주세요.',
          },
        };
      }

      const selectedImages = request.imageIds.map((id) =>
        selectedNaverImages.get(id),
      );

      if (selectedImages.some((image) => !image)) {
        return {
          ok: false,
          error: {
            code: 'INVALID_IMAGE_SELECTION',
            message: '선택한 이미지 정보를 확인할 수 없습니다. 다시 선택해 주세요.',
          },
        };
      }

      activeRun = true;

      const appWindow = BrowserWindow.fromWebContents(event.sender);
      const imageAbortController = new AbortController();
      let userLeftApp = !await prepareAutomationFocus(appWindow);
      const recordAppBlur = (): void => {
        userLeftApp = true;
        imageAbortController.abort();
      };
      const userInteractionResponse = () => {
        if (appWindow && !appWindow.isDestroyed()) {
          appWindow.show();
          appWindow.focus();
        }

        return {
          ok: false as const,
          error: {
            code: 'USER_INTERACTION_DETECTED',
            message: '이미지 첨부 중 BLOW 화면을 벗어난 것을 감지해 남은 작업을 멈췄습니다. 자동으로 다시 첨부하지 말고 Chrome에서 결과를 확인한 뒤 작업 중단으로 새 작업을 시작해 주세요.',
          },
        };
      };

      if (appWindow && !appWindow.isDestroyed()) {
        appWindow.on('blur', recordAppBlur);
      }

      try {
        if (userLeftApp) {
          return userInteractionResponse();
        }

        await new Promise((resolve) => setTimeout(resolve, 2_000));

        if (userLeftApp) {
          return userInteractionResponse();
        }

        const result = await session.attachImages(
          selectedImages.map((image) => image!.path),
          request.layout,
          imageAbortController.signal,
          request.paragraphNumbers,
        );

        if (userLeftApp) {
          return userInteractionResponse();
        }

        selectedNaverImages.clear();
        return { ok: true, result };
      } catch (error) {
        if (error instanceof NaverConnectionRunnerError) {
          if (error.failure.code === 'BROWSER_CLOSED') {
            activeNaverSession = null;
          }

          if (userLeftApp) {
            return userInteractionResponse();
          }

          return {
            ok: false,
            error: error.failure,
          };
        }

        if (userLeftApp) {
          return userInteractionResponse();
        }

        return {
          ok: false,
          error: {
            code: 'IMAGE_UPLOAD_FAILED',
            message: '이미지 첨부를 완료하지 못했습니다. Chrome 화면을 확인해 주세요.',
          },
        };
      } finally {
        if (appWindow && !appWindow.isDestroyed()) {
          appWindow.off('blur', recordAppBlur);
        }

        activeRun = false;
      }
    },
  );

  ipcMain.handle(
    ipcChannels.naverTestNetworkInterruption,
    async (event) => {
      requireTrustedSender(event);

      if (activeRun) {
        return busyResponse();
      }

      const session = activeNaverSession;

      if (!session) {
        return {
          ok: false,
          error: {
            code: 'NAVER_SESSION_NOT_FOUND',
            message: '전용 Chrome을 먼저 열어 주세요.',
          },
        };
      }

      activeRun = true;

      try {
        return {
          ok: true,
          result: await session.testNetworkInterruption(),
        };
      } catch (error) {
        if (error instanceof NaverConnectionRunnerError) {
          if (error.failure.code === 'BROWSER_CLOSED') {
            activeNaverSession = null;
          }

          return {
            ok: false,
            error: error.failure,
          };
        }

        return {
          ok: false,
          error: {
            code: 'NETWORK_TEST_UNCONFIRMED',
            message: '네트워크 끊김 감지를 확인하지 못했습니다. 다시 시도해 주세요.',
          },
        };
      } finally {
        activeRun = false;
      }
    },
  );

  ipcMain.handle(
    ipcChannels.naverTestStructureChange,
    async (event) => {
      requireTrustedSender(event);

      if (activeRun) {
        return busyResponse();
      }

      const session = activeNaverSession;

      if (!session) {
        return {
          ok: false,
          error: {
            code: 'NAVER_SESSION_NOT_FOUND',
            message: '전용 Chrome을 먼저 열어 주세요.',
          },
        };
      }

      activeRun = true;

      try {
        return {
          ok: true,
          result: await session.testStructureChangeSafety(),
        };
      } catch (error) {
        if (error instanceof NaverConnectionRunnerError) {
          if (error.failure.code === 'BROWSER_CLOSED') {
            activeNaverSession = null;
          }

          return {
            ok: false,
            error: error.failure,
          };
        }

        return {
          ok: false,
          error: {
            code: 'STRUCTURE_TEST_UNCONFIRMED',
            message: '화면 구조 변경 시 안전 중단을 확인하지 못했습니다. 다시 시도해 주세요.',
          },
        };
      } finally {
        activeRun = false;
      }
    },
  );

  ipcMain.handle(
    ipcChannels.naverMonitorUserInteraction,
    async (event): Promise<
      | { readonly ok: true; readonly result: NaverUserInteractionResult }
      | {
          readonly ok: false;
          readonly error: { readonly code: string; readonly message: string };
        }
    > => {
      requireTrustedSender(event);

      if (activeRun) {
        return busyResponse();
      }

      const session = activeNaverSession;

      if (!session) {
        return {
          ok: false,
          error: {
            code: 'NAVER_SESSION_NOT_FOUND',
            message: '전용 Chrome을 먼저 열어 주세요.',
          },
        };
      }

      activeRun = true;

      try {
        const result = await session.waitForUserInteraction();
        const appWindow = BrowserWindow.fromWebContents(event.sender);

        if (appWindow && !appWindow.isDestroyed()) {
          appWindow.show();
          appWindow.focus();
        }

        return { ok: true, result };
      } catch (error) {
        if (error instanceof NaverConnectionRunnerError) {
          if (error.failure.code === 'BROWSER_CLOSED') {
            activeNaverSession = null;
          }

          return {
            ok: false,
            error: error.failure,
          };
        }

        return {
          ok: false,
          error: {
            code: 'NAVER_CONNECTION_FAILED',
            message: '사용자 조작 감지를 완료하지 못했습니다. 다시 시도해 주세요.',
          },
        };
      } finally {
        activeRun = false;
      }
    },
  );

  ipcMain.handle(ipcChannels.naverForceExitTest, async (event) => {
    requireTrustedSender(event);

    if (activeRun) {
      return busyResponse();
    }

    const appWindow = BrowserWindow.fromWebContents(event.sender);
    const options = {
      type: 'warning' as const,
      title: '앱 강제 종료 테스트',
      message: 'BLOW를 즉시 종료하시겠습니까?',
      detail: '저장되지 않은 현재 작업은 복구하지 않습니다. 네이버 편집기에 남은 내용은 자동으로 삭제하지 않습니다.',
      buttons: ['취소', '테스트 종료'],
      defaultId: 0,
      cancelId: 0,
      noLink: true,
    };
    const result = appWindow && !appWindow.isDestroyed()
      ? await dialog.showMessageBox(appWindow, options)
      : await dialog.showMessageBox(options);

    if (result.response !== 1) {
      return { ok: true, canceled: true };
    }

    quitting = true;
    setTimeout(() => app.exit(0), 150);
    return { ok: true, canceled: false };
  });

  ipcMain.handle(
    ipcChannels.naverInspectCompatibilityEnvironment,
    async (event) => {
      requireTrustedSender(event);

      if (activeRun) {
        return busyResponse();
      }

      const session = activeNaverSession;

      if (!session) {
        return {
          ok: false,
          error: {
            code: 'NAVER_SESSION_NOT_FOUND',
            message: '전용 Chrome을 먼저 열어 주세요.',
          },
        };
      }

      if (process.platform !== 'win32') {
        return {
          ok: false,
          error: {
            code: 'UNSUPPORTED_PLATFORM',
            message: '현재 기술검증은 Windows에서만 진행할 수 있습니다.',
          },
        };
      }

      activeRun = true;

      try {
        const appWindow = BrowserWindow.fromWebContents(event.sender);
        const display = appWindow && !appWindow.isDestroyed()
          ? screen.getDisplayMatching(appWindow.getBounds())
          : screen.getPrimaryDisplay();
        const systemVersion = process.getSystemVersion();
        const result: CompatibilityEnvironmentResult = {
          stage: 'COMPATIBILITY_ENVIRONMENT_RECORDED',
          message: '현재 테스트 환경을 확인했습니다.',
          operatingSystem: getWindowsDisplayName(systemVersion),
          chromeVersion: session.getChromeVersion(),
          displayScalePercent: toDisplayScalePercent(display.scaleFactor),
        };

        return { ok: true, result };
      } catch (error) {
        if (error instanceof NaverConnectionRunnerError) {
          return {
            ok: false,
            error: error.failure,
          };
        }

        return {
          ok: false,
          error: {
            code: 'COMPATIBILITY_ENVIRONMENT_UNCONFIRMED',
            message: '현재 테스트 환경을 확인하지 못했습니다. 다시 시도해 주세요.',
          },
        };
      } finally {
        activeRun = false;
      }
    },
  );

  ipcMain.handle(
    ipcChannels.naverTestWriterNavigationRepeat,
    async (event) => {
      requireTrustedSender(event);

      if (activeRun) {
        return busyResponse();
      }

      const session = activeNaverSession;

      if (!session) {
        return {
          ok: false,
          error: {
            code: 'NAVER_SESSION_NOT_FOUND',
            message: '전용 Chrome을 먼저 열어 주세요.',
          },
        };
      }

      activeRun = true;

      try {
        const result = await session.testWriterNavigationRepetition(
          20,
          (progress: WriterNavigationRepeatProgress) => {
            if (!event.sender.isDestroyed()) {
              event.sender.send(
                ipcChannels.naverWriterNavigationProgress,
                progress,
              );
            }
          },
        );

        return { ok: true, result };
      } catch (error) {
        if (error instanceof NaverConnectionRunnerError) {
          if (error.failure.code === 'BROWSER_CLOSED') {
            activeNaverSession = null;
          }

          return {
            ok: false,
            error: error.failure,
          };
        }

        return {
          ok: false,
          error: {
            code: 'WRITER_NAVIGATION_REPEAT_FAILED',
            message: '글쓰기 화면 반복 진입을 완료하지 못했습니다. 다시 시도해 주세요.',
          },
        };
      } finally {
        activeRun = false;
      }
    },
  );

  ipcMain.handle(
    ipcChannels.naverTestSlowNetwork,
    async (event) => {
      requireTrustedSender(event);

      if (activeRun) {
        return busyResponse();
      }

      const session = activeNaverSession;

      if (!session) {
        return {
          ok: false,
          error: {
            code: 'NAVER_SESSION_NOT_FOUND',
            message: '전용 Chrome을 먼저 열어 주세요.',
          },
        };
      }

      activeRun = true;

      try {
        return {
          ok: true,
          result: await session.testSlowNetwork(1_500),
        };
      } catch (error) {
        if (error instanceof NaverConnectionRunnerError) {
          if (error.failure.code === 'BROWSER_CLOSED') {
            activeNaverSession = null;
          }

          return {
            ok: false,
            error: error.failure,
          };
        }

        return {
          ok: false,
          error: {
            code: 'SLOW_NETWORK_TEST_FAILED',
            message: '느린 네트워크 대응을 확인하지 못했습니다. 다시 시도해 주세요.',
          },
        };
      } finally {
        activeRun = false;
      }
    },
  );

  ipcMain.handle(ipcChannels.naverFocus, async (event) => {
    requireTrustedSender(event);

    if (!activeNaverSession) {
      return {
        ok: false,
        error: {
          code: 'NAVER_SESSION_NOT_FOUND',
          message: '열려 있는 전용 Chrome이 없습니다.',
        },
      };
    }

    await activeNaverSession.bringToFront();

    return { ok: true };
  });

  ipcMain.handle(ipcChannels.naverClose, async (event) => {
    requireTrustedSender(event);
    naverStopVersion += 1;
    await closeNaverBrowser();
    await waitForNaverRunToSettle();
    await closeNaverBrowser();
    return { ok: true };
  });
}

function registerIpc(): void {
  ipcMain.handle(ipcChannels.systemAppVersion, (event) => {
    requireTrustedSender(event);
    return app.getVersion();
  });
  ipcMain.handle(ipcChannels.systemDeviceHash, (event) => {
    requireTrustedSender(event);
    return getWindowsDeviceHash();
  });
  ipcMain.handle(ipcChannels.openAiCredentialStatus, async (event) => {
    requireTrustedSender(event);

    try {
      return {
        ok: true,
        status: await readOpenAiCredentialStatus(
          getOpenAiCredentialPath(),
          safeStorage,
        ),
      };
    } catch {
      return {
        ok: false,
        error: {
          code: 'CREDENTIAL_STATUS_FAILED',
          message: 'OpenAI API 키 보관 상태를 확인하지 못했습니다.',
        },
      };
    }
  });
  ipcMain.handle(
    ipcChannels.openAiCredentialSave,
    async (event, input: unknown) => {
      requireTrustedSender(event);

      try {
        return {
          ok: true,
          status: await saveOpenAiCredential(
            getOpenAiCredentialPath(),
            input,
            safeStorage,
          ),
        };
      } catch {
        return {
          ok: false,
          error: {
            code: 'CREDENTIAL_SAVE_FAILED',
            message: 'OpenAI API 키를 저장하지 못했습니다. 키와 Windows 보안 상태를 확인해 주세요.',
          },
        };
      }
    },
  );
  ipcMain.handle(ipcChannels.openAiCredentialRemove, async (event) => {
    requireTrustedSender(event);

    try {
      return {
        ok: true,
        status: await removeOpenAiCredential(
          getOpenAiCredentialPath(),
          safeStorage,
        ),
      };
    } catch {
      return {
        ok: false,
        error: {
          code: 'CREDENTIAL_REMOVE_FAILED',
          message: '저장된 OpenAI API 키를 삭제하지 못했습니다.',
        },
      };
    }
  });
  ipcMain.handle(ipcChannels.openAiConnectionTest, async (event) => {
    requireTrustedSender(event);

    try {
      const apiKey = await readOpenAiCredential(
        getOpenAiCredentialPath(),
        safeStorage,
      );

      if (!apiKey) {
        return {
          ok: false,
          error: {
            code: 'CREDENTIAL_MISSING',
            message: '먼저 OpenAI API 키를 안전하게 저장해 주세요.',
          },
        };
      }

      const result = await testOpenAiConnection(apiKey);

      if (!result.ok) {
        return {
          ok: false,
          error: {
            code: result.code,
            message: result.message,
          },
        };
      }

      return { ok: true, checkedAt: new Date().toISOString() };
    } catch {
      return {
        ok: false,
        error: {
          code: 'CONNECTION_CHECK_FAILED',
          message: 'OpenAI 연결을 확인하지 못했습니다. 잠시 후 다시 시도해 주세요.',
        },
      };
    }
  });
  ipcMain.handle(ipcChannels.openAiModelList, async (event) => {
    requireTrustedSender(event);

    try {
      const apiKey = await readOpenAiCredential(
        getOpenAiCredentialPath(),
        safeStorage,
      );

      if (!apiKey) {
        return {
          ok: false,
          error: {
            code: 'CREDENTIAL_MISSING',
            message: '먼저 OpenAI API 키를 안전하게 저장해 주세요.',
          },
        };
      }

      const result = await listOpenAiModelIds(apiKey);

      if (!result.ok) {
        return {
          ok: false,
          error: {
            code: result.code,
            message: result.message,
          },
        };
      }

      return { ok: true, modelIds: result.modelIds };
    } catch {
      return {
        ok: false,
        error: {
          code: 'MODEL_LIST_FAILED',
          message: '사용 가능한 OpenAI 모델을 확인하지 못했습니다. 잠시 후 다시 시도해 주세요.',
        },
      };
    }
  });
  ipcMain.handle(
    ipcChannels.openAiRecommendTopics,
    async (event, rawInput: unknown) => {
      requireTrustedSender(event);

      if (activeOpenAiGeneration) {
        return {
          ok: false,
          code: 'GENERATION_IN_PROGRESS',
          message: '이미 콘텐츠를 생성하고 있습니다. 완료되거나 중단된 뒤 다시 시도해 주세요.',
        };
      }

      const controller = new AbortController();
      activeOpenAiGeneration = controller;
      try {
        const input = normalizeTopicRecommendationRequest(rawInput);
        const [apiKey, profile] = await Promise.all([
          readOpenAiCredential(getOpenAiCredentialPath(), safeStorage),
          readBrandProfile(getBrandProfilePath(input.userId)),
        ]);

        if (!apiKey) {
          return {
            ok: false,
            code: 'CREDENTIAL_MISSING',
            message: '먼저 OpenAI API 키를 안전하게 저장해 주세요.',
          };
        }

        if (!profile) {
          return {
            ok: false,
            code: 'BRAND_PROFILE_MISSING',
            message: '먼저 브랜드 프로필의 필수 정보를 저장해 주세요.',
          };
        }

        return await recommendOpenAiTopics(
          apiKey,
          input,
          profile,
          fetch,
          controller.signal,
        );
      } catch {
        return {
          ok: false,
          code: 'GENERATION_INPUT_INVALID',
          message: '추천 요청 내용을 확인한 뒤 다시 시도해 주세요.',
        };
      } finally {
        if (activeOpenAiGeneration === controller) activeOpenAiGeneration = null;
      }
    },
  );
  ipcMain.handle(
    ipcChannels.openAiGenerateDraft,
    async (event, rawInput: unknown) => {
      requireTrustedSender(event);

      if (activeOpenAiGeneration) {
        return {
          ok: false,
          code: 'GENERATION_IN_PROGRESS',
          message: '이미 콘텐츠를 생성하고 있습니다. 완료되거나 중단된 뒤 다시 시도해 주세요.',
        };
      }

      const controller = new AbortController();
      activeOpenAiGeneration = controller;
      try {
        const input = normalizeBlogGenerationRequest(rawInput);
        const [apiKey, profile] = await Promise.all([
          readOpenAiCredential(getOpenAiCredentialPath(), safeStorage),
          readBrandProfile(getBrandProfilePath(input.userId)),
        ]);

        if (!apiKey) {
          return {
            ok: false,
            code: 'CREDENTIAL_MISSING',
            message: '먼저 OpenAI API 키를 안전하게 저장해 주세요.',
          };
        }

        if (!profile) {
          return {
            ok: false,
            code: 'BRAND_PROFILE_MISSING',
            message: '먼저 브랜드 프로필의 필수 정보를 저장해 주세요.',
          };
        }

        return await generateOpenAiBlogDraft(
          apiKey,
          input,
          profile,
          fetch,
          controller.signal,
        );
      } catch {
        return {
          ok: false,
          code: 'GENERATION_INPUT_INVALID',
          message: '글 생성 입력값을 확인한 뒤 다시 시도해 주세요.',
        };
      } finally {
        if (activeOpenAiGeneration === controller) activeOpenAiGeneration = null;
      }
    },
  );
  ipcMain.handle(
    ipcChannels.openAiGenerateImages,
    async (event, rawInput: unknown) => {
      requireTrustedSender(event);

      if (activeOpenAiGeneration) {
        return {
          ok: false,
          code: 'GENERATION_IN_PROGRESS',
          message: '이미 콘텐츠를 생성하고 있습니다. 완료되거나 중단된 뒤 다시 시도해 주세요.',
        };
      }

      const controller = new AbortController();
      activeOpenAiGeneration = controller;
      try {
        const input = normalizeBlogImageGenerationRequest(rawInput);
        const [apiKey, profile] = await Promise.all([
          readOpenAiCredential(getOpenAiCredentialPath(), safeStorage),
          readBrandProfile(getBrandProfilePath(input.userId)),
        ]);

        if (!apiKey) {
          return {
            ok: false,
            code: 'CREDENTIAL_MISSING',
            message: '먼저 OpenAI API 키를 안전하게 저장해 주세요.',
          };
        }

        if (!profile) {
          return {
            ok: false,
            code: 'BRAND_PROFILE_MISSING',
            message: '먼저 브랜드 프로필의 필수 정보를 저장해 주세요.',
          };
        }

        return await generateOpenAiBlogImages(
          apiKey,
          input,
          profile,
          fetch,
          controller.signal,
        );
      } catch {
        return {
          ok: false,
          code: 'GENERATION_INPUT_INVALID',
          message: '이미지 생성 설정을 확인한 뒤 다시 시도해 주세요.',
        };
      } finally {
        if (activeOpenAiGeneration === controller) activeOpenAiGeneration = null;
      }
    },
  );
  ipcMain.handle(ipcChannels.openAiGenerationCancel, (event) => {
    requireTrustedSender(event);
    const cancelled = activeOpenAiGeneration !== null;
    activeOpenAiGeneration?.abort();
    return { ok: true, cancelled };
  });
  registerMockIpc();
  ipcMain.handle(ipcChannels.brandProfileGet, async (event, userId: unknown) => {
    requireTrustedSender(event);

    try {
      return {
        ok: true,
        profile: await readBrandProfile(getBrandProfilePath(userId)),
      };
    } catch {
      return {
        ok: false,
        error: {
          code: 'BRAND_PROFILE_READ_FAILED',
          message: '저장된 브랜드 정보를 불러오지 못했습니다.',
        },
      };
    }
  });
  ipcMain.handle(
    ipcChannels.brandProfileSave,
    async (event, userId: unknown, input: unknown) => {
      requireTrustedSender(event);

      try {
        return {
          ok: true,
          profile: await saveBrandProfile(
            getBrandProfilePath(userId),
            input,
          ),
        };
      } catch {
        return {
          ok: false,
          error: {
            code: 'BRAND_PROFILE_SAVE_FAILED',
            message: '브랜드 정보를 저장하지 못했습니다. 필수 항목을 확인해 주세요.',
          },
        };
      }
    },
  );
  ipcMain.handle(ipcChannels.brandProfileProductsSave, async (event, userId: unknown, input: unknown) => {
    requireTrustedSender(event);
    try {
      return { ok: true, profile: await saveBrandProfileProducts(getBrandProfilePath(userId), input) };
    } catch {
      return {
        ok: false,
        error: {
          code: 'BRAND_PRODUCTS_SAVE_FAILED',
          message: '상품·서비스를 저장하지 못했습니다. 기본 블로그 세팅의 저장 여부와 목록을 확인한 뒤 다시 시도해 주세요.',
        },
      };
    }
  });
  ipcMain.handle(ipcChannels.workHistoryList, async (event, userId: unknown) => {
    requireTrustedSender(event);

    try {
      return {
        ok: true,
        entries: await readWorkHistory(getWorkHistoryPath(userId)),
      };
    } catch {
      return {
        ok: false,
        error: {
          code: 'WORK_HISTORY_READ_FAILED',
          message: '이 PC에 저장된 작업 내역을 불러오지 못했습니다.',
        },
      };
    }
  });
  ipcMain.handle(
    ipcChannels.workHistoryAdd,
    async (event, userId: unknown, input: unknown) => {
      requireTrustedSender(event);

      try {
        return {
          ok: true,
          entry: await addWorkHistoryEntry(getWorkHistoryPath(userId), input),
        };
      } catch {
        return {
          ok: false,
          error: {
            code: 'WORK_HISTORY_SAVE_FAILED',
            message: '임시저장은 완료됐지만 작업 내역을 이 PC에 기록하지 못했습니다.',
          },
        };
      }
    },
  );
  ipcMain.handle(
    ipcChannels.workHistoryDelete,
    async (event, userId: unknown, entryId: unknown) => {
      requireTrustedSender(event);

      try {
        return {
          ok: true,
          entries: await deleteWorkHistoryEntry(
            getWorkHistoryPath(userId),
            entryId,
          ),
        };
      } catch {
        return {
          ok: false,
          error: {
            code: 'WORK_HISTORY_DELETE_FAILED',
            message: '선택한 작업 내역을 삭제하지 못했습니다.',
          },
        };
      }
    },
  );
  ipcMain.handle(
    ipcChannels.workHistoryOpenDraft,
    async (event, userId: unknown, entryId: unknown) => {
      requireTrustedSender(event);

      if (activeRun) {
        return busyResponse();
      }

      const id = typeof entryId === 'string' ? entryId.trim() : '';
      const entries = await readWorkHistory(getWorkHistoryPath(userId))
        .catch(() => []);
      const entry = entries.find((candidate) => candidate.id === id);

      if (!entry?.naverUrl) {
        return {
          ok: false,
          error: {
            code: 'WORK_HISTORY_ENTRY_NOT_FOUND',
            message: '열 수 있는 임시글 기록을 찾지 못했습니다.',
          },
        };
      }

      activeRun = true;
      const stopVersion = naverStopVersion;
      await closeAllBrowsers();

      try {
        const { profilePath } = getPocPaths();
        const created = await NaverConnectionSession.create({
          profilePath,
          blogUrl: entry.naverUrl,
          headless: false,
        });

        if (stopVersion !== naverStopVersion) {
          await created.session.close();
          return {
            ok: false,
            error: {
              code: 'AUTOMATION_STOPPED',
              message: '작업을 중단했습니다.',
            },
          };
        }

        trackNaverSession(created.session, event.sender);
        if (stopVersion !== naverStopVersion) {
          return {
            ok: false,
            error: {
              code: 'AUTOMATION_STOPPED',
              message: '작업을 중단했습니다.',
            },
          };
        }

        return {
          ok: true,
          result: await created.session.openSavedDraft(
            entry.naverUrl,
            {
              title: entry.title,
              paragraphs: toDraftParagraphs(entry.body),
            },
          ),
        };
      } catch (error) {
        if (error instanceof NaverConnectionRunnerError) {
          if (error.failure.code === 'BROWSER_CLOSED') {
            activeNaverSession = null;
          }

          return {
            ok: false,
            error: error.failure,
          };
        }

        return {
          ok: false,
          error: {
            code: 'SAVED_DRAFT_OPEN_FAILED',
            message: '네이버 임시글을 열지 못했습니다. 연결 상태를 확인해 주세요.',
          },
        };
      } finally {
        activeRun = false;
      }
    },
  );
  registerNaverIpc();
}

function toDraftParagraphs(body: string): readonly string[] {
  return body
    .replace(/\r\n?/g, '\n')
    .split(/\n+/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean);
}

function createMainWindow(): BrowserWindow {
  const window = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 760,
    minHeight: 620,
    show: false,
    backgroundColor: '#f4f8f5',
    title: 'BLOW',
    autoHideMenuBar: true,
    webPreferences: {
      preload: join(__dirname, '../preload/index.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
    },
  });

  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  window.webContents.on('will-navigate', (event, url) => {
    if (url !== window.webContents.getURL()) {
      event.preventDefault();
    }
  });

  window.once('ready-to-show', () => window.show());

  if (isDevelopment && process.env.ELECTRON_RENDERER_URL) {
    void window.loadURL(process.env.ELECTRON_RENDERER_URL);
  } else {
    void window.loadFile(join(__dirname, '../renderer/index.html'));
  }

  return window;
}

const hasInstanceLock = app.requestSingleInstanceLock();

if (!hasInstanceLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) {
        mainWindow.restore();
      }

      mainWindow.focus();
    }
  });

  app.whenReady().then(async () => {
    await Promise.all([
      discardPendingGeneratedImages(getPendingGeneratedImagesDirectory()),
      pruneGeneratedImages(getGeneratedImagesDirectory()),
    ]).catch(() => undefined);
    registerIpc();
    mainWindow = createMainWindow();

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        mainWindow = createMainWindow();
      }
    });
  });
}

app.on('before-quit', (event) => {
  if (
    quitting ||
    (!activeMockResult && !activeNaverSession)
  ) {
    return;
  }

  event.preventDefault();
  quitting = true;

  void closeAllBrowsers().finally(() => app.quit());
});

app.on('window-all-closed', () => {
  app.quit();
});

import { randomUUID } from 'node:crypto';
import { stat } from 'node:fs/promises';
import { basename, extname, join, resolve } from 'node:path';
import {
  app,
  BrowserWindow,
  dialog,
  ipcMain,
  type IpcMainInvokeEvent,
  type OpenDialogOptions,
  type WebContents,
} from 'electron';

import type {
  DraftContent,
  NaverDividerPosition,
  NaverImageLayout,
  NaverStickerPosition,
} from '@blow/naver-adapter';
import {
  MockPocError,
  runMockPoc,
  type MockPocResult,
} from './mock-poc.js';
import {
  NaverConnectionRunnerError,
  NaverConnectionSession,
} from './naver-connection.js';

const isDevelopment = process.env.NODE_ENV !== 'production';

const ipcChannels = {
  mockStart: 'poc:start',
  mockCloseBrowser: 'poc:close-browser',
  mockState: 'poc:state',
  naverOpen: 'naver:open',
  naverState: 'naver:state',
  naverVerify: 'naver:verify',
  naverOpenWriter: 'naver:open-writer',
  naverEnterContent: 'naver:enter-content',
  naverInsertDivider: 'naver:insert-divider',
  naverInsertSticker: 'naver:insert-sticker',
  naverSelectImages: 'naver:select-images',
  naverAttachImages: 'naver:attach-images',
  naverClose: 'naver:close',
  naverFocus: 'naver:focus',
} as const;

let mainWindow: BrowserWindow | null = null;
let activeRun = false;
let activeMockResult: MockPocResult | null = null;
let activeNaverSession: NaverConnectionSession | null = null;
const selectedNaverImages = new Map<
  string,
  { readonly path: string; readonly name: string; readonly sizeBytes: number }
>();
let naverWatchVersion = 0;
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

function parseDividerRequest(input: unknown): {
  readonly paragraphNumber: number;
  readonly position: NaverDividerPosition;
} | null {
  if (!input || typeof input !== 'object') {
    return null;
  }

  const candidate = input as {
    readonly paragraphNumber?: unknown;
    readonly position?: unknown;
  };

  if (
    !Number.isInteger(candidate.paragraphNumber) ||
    (candidate.paragraphNumber as number) < 1 ||
    (candidate.paragraphNumber as number) > 100 ||
    (candidate.position !== 'before' && candidate.position !== 'after')
  ) {
    return null;
  }

  return {
    paragraphNumber: candidate.paragraphNumber as number,
    position: candidate.position,
  };
}

function parseStickerRequest(input: unknown): {
  readonly paragraphNumber: number;
  readonly position: NaverStickerPosition;
} | null {
  return parseDividerRequest(input);
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
} | null {
  if (!input || typeof input !== 'object') {
    return null;
  }

  const candidate = input as {
    readonly imageIds?: unknown;
    readonly layout?: unknown;
  };
  const imageIds = parseSelectedImageIds(candidate.imageIds);
  const layout = candidate.layout;

  if (
    !imageIds ||
    (layout !== 'individual' && layout !== 'collage' && layout !== 'slide')
  ) {
    return null;
  }

  return { imageIds, layout };
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
    await closeAllBrowsers();

    try {
      const { profilePath } = getPocPaths();
      const result = await NaverConnectionSession.create({
        profilePath,
        blogUrl: requireBlogUrl(input),
        headless: false,
      });
      activeNaverSession = result.session;

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

      try {
        return {
          ok: true,
          result: await session.enterContent(content),
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
            message: '제목과 본문 입력을 완료하지 못했습니다. Chrome 화면을 확인해 주세요.',
          },
        };
      } finally {
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

      try {
        return {
          ok: true,
          result: await session.insertDivider(
            request.paragraphNumber,
            request.position,
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
            code: 'DIVIDER_INSERT_UNCONFIRMED',
            message: '구분선 삽입을 완료하지 못했습니다. Chrome 화면을 확인해 주세요.',
          },
        };
      } finally {
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
            message: '스티커를 넣을 문단과 위치를 다시 선택해 주세요.',
          },
        };
      }

      activeRun = true;

      try {
        return {
          ok: true,
          result: await session.insertDefaultSticker(
            request.paragraphNumber,
            request.position,
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
            code: 'STICKER_INSERT_UNCONFIRMED',
            message: '스티커 삽입을 완료하지 못했습니다. Chrome 화면을 확인해 주세요.',
          },
        };
      } finally {
        activeRun = false;
      }
    },
  );

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

      try {
        const result = await session.attachImages(
          selectedImages.map((image) => image!.path),
          request.layout,
        );
        selectedNaverImages.clear();
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
            code: 'IMAGE_UPLOAD_FAILED',
            message: '이미지 첨부를 완료하지 못했습니다. Chrome 화면을 확인해 주세요.',
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
    await closeNaverBrowser();
    return { ok: true };
  });
}

function registerIpc(): void {
  registerMockIpc();
  registerNaverIpc();
}

function createMainWindow(): BrowserWindow {
  const window = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 760,
    minHeight: 620,
    show: false,
    backgroundColor: '#f4f5f7',
    title: 'BLOW 개발 작업대',
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

  app.whenReady().then(() => {
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

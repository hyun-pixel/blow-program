import { join, resolve } from 'node:path';
import {
  app,
  BrowserWindow,
  ipcMain,
  type IpcMainInvokeEvent,
} from 'electron';

import {
  MockPocError,
  runMockPoc,
  type MockPocResult,
} from './mock-poc.js';

const isDevelopment = process.env.NODE_ENV !== 'production';

const ipcChannels = {
  start: 'poc:start',
  closeBrowser: 'poc:close-browser',
  state: 'poc:state',
} as const;

let mainWindow: BrowserWindow | null = null;
let activeRun = false;
let activeResult: MockPocResult | null = null;
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

async function closePocBrowser(): Promise<void> {
  const result = activeResult;
  activeResult = null;
  await result?.closeBrowser();
}

function registerIpc(): void {
  ipcMain.handle(ipcChannels.start, async (event) => {
    requireTrustedSender(event);

    if (activeRun) {
      return {
        ok: false,
        error: {
          code: 'POC_ALREADY_RUNNING',
          message: '자동 입력 테스트가 이미 진행 중입니다.',
        },
      };
    }

    activeRun = true;
    await closePocBrowser();

    try {
      const paths = getPocPaths();
      activeResult = await runMockPoc({
        ...paths,
        headless: false,
        keepBrowserOpen: true,
        onSnapshot: (snapshot) => {
          if (!event.sender.isDestroyed()) {
            event.sender.send(ipcChannels.state, snapshot);
          }
        },
      });

      return {
        ok: true,
        snapshot: activeResult.snapshot,
        verification: activeResult.verification,
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

  ipcMain.handle(ipcChannels.closeBrowser, async (event) => {
    requireTrustedSender(event);
    await closePocBrowser();
    return { ok: true };
  });
}

function createMainWindow(): BrowserWindow {
  const window = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 760,
    minHeight: 620,
    show: false,
    backgroundColor: '#f4f5f7',
    title: 'BLOW 자동 입력 기술검증',
    autoHideMenuBar: true,
    webPreferences: {
      preload: join(__dirname, '../preload/index.mjs'),
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
  if (quitting || !activeResult) {
    return;
  }

  event.preventDefault();
  quitting = true;

  void closePocBrowser().finally(() => app.quit());
});

app.on('window-all-closed', () => {
  app.quit();
});

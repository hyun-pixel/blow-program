import {
  contextBridge,
  ipcRenderer,
  type IpcRendererEvent,
} from 'electron';
import type { PocSnapshot } from '@blow/automation-core';
import type {
  DraftContent,
  NaverConnectionStatus,
  NaverDividerInsertionResult,
  NaverDividerPosition,
  NaverEditorInputResult,
  NaverImageAttachmentResult,
  NaverImageLayout,
  NaverSelectedImageFile,
  NaverQuoteInsertionResult,
  NaverQuotePosition,
  NaverStickerInsertionResult,
  NaverStickerPosition,
} from '@blow/naver-adapter';

type NaverStateResponse =
  | {
      readonly ok: true;
      readonly status: NaverConnectionStatus;
    }
  | {
      readonly ok: false;
      readonly error: {
        readonly code: string;
        readonly message: string;
      };
    };

type NaverInputResponse =
  | {
      readonly ok: true;
      readonly result: NaverEditorInputResult;
    }
  | {
      readonly ok: false;
      readonly error: {
        readonly code: string;
        readonly message: string;
      };
    };

type NaverDividerResponse =
  | {
      readonly ok: true;
      readonly result: NaverDividerInsertionResult;
    }
  | {
      readonly ok: false;
      readonly error: {
        readonly code: string;
        readonly message: string;
      };
    };

type NaverQuoteResponse =
  | {
      readonly ok: true;
      readonly result: NaverQuoteInsertionResult;
    }
  | {
      readonly ok: false;
      readonly error: {
        readonly code: string;
        readonly message: string;
      };
    };

type NaverStickerResponse =
  | {
      readonly ok: true;
      readonly result: NaverStickerInsertionResult;
    }
  | {
      readonly ok: false;
      readonly error: {
        readonly code: string;
        readonly message: string;
      };
    };

type NaverImageSelectionResponse =
  | {
      readonly ok: true;
      readonly canceled: boolean;
      readonly files: readonly NaverSelectedImageFile[];
    }
  | {
      readonly ok: false;
      readonly error: {
        readonly code: string;
        readonly message: string;
      };
    };

type NaverImageResponse =
  | {
      readonly ok: true;
      readonly result: NaverImageAttachmentResult;
    }
  | {
      readonly ok: false;
      readonly error: {
        readonly code: string;
        readonly message: string;
      };
    };

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
  naverInsertQuote: 'naver:insert-quote',
  naverInsertSticker: 'naver:insert-sticker',
  naverSelectImages: 'naver:select-images',
  naverAttachImages: 'naver:attach-images',
  naverClose: 'naver:close',
  naverFocus: 'naver:focus',
} as const;

const blowPocApi = {
  start: () => ipcRenderer.invoke(ipcChannels.mockStart),
  closeBrowser: () => ipcRenderer.invoke(ipcChannels.mockCloseBrowser),
  onState: (listener: (snapshot: PocSnapshot) => void) => {
    const handler = (_event: IpcRendererEvent, snapshot: PocSnapshot): void => {
      listener(snapshot);
    };

    ipcRenderer.on(ipcChannels.mockState, handler);

    return () => {
      ipcRenderer.removeListener(ipcChannels.mockState, handler);
    };
  },
};

const blowNaverApi = {
  open: (blogUrl: string) => ipcRenderer.invoke(
    ipcChannels.naverOpen,
    blogUrl,
  ),
  onState: (listener: (response: NaverStateResponse) => void) => {
    const handler = (
      _event: IpcRendererEvent,
      response: NaverStateResponse,
    ): void => {
      listener(response);
    };

    ipcRenderer.on(ipcChannels.naverState, handler);

    return () => {
      ipcRenderer.removeListener(ipcChannels.naverState, handler);
    };
  },
  verify: () => ipcRenderer.invoke(ipcChannels.naverVerify),
  openWriter: () => ipcRenderer.invoke(ipcChannels.naverOpenWriter),
  enterContent: (content: DraftContent): Promise<NaverInputResponse> =>
    ipcRenderer.invoke(ipcChannels.naverEnterContent, content),
  insertDivider: (
    paragraphNumber: number,
    position: NaverDividerPosition,
  ): Promise<NaverDividerResponse> =>
    ipcRenderer.invoke(ipcChannels.naverInsertDivider, {
      paragraphNumber,
      position,
    }),
  insertDefaultQuote: (
    paragraphNumber: number,
    position: NaverQuotePosition,
  ): Promise<NaverQuoteResponse> =>
    ipcRenderer.invoke(ipcChannels.naverInsertQuote, {
      paragraphNumber,
      position,
    }),
  insertDefaultSticker: (
    paragraphNumber: number,
    position: NaverStickerPosition,
  ): Promise<NaverStickerResponse> =>
    ipcRenderer.invoke(ipcChannels.naverInsertSticker, {
      paragraphNumber,
      position,
    }),
  selectImages: (): Promise<NaverImageSelectionResponse> =>
    ipcRenderer.invoke(ipcChannels.naverSelectImages),
  attachImages: (
    imageIds: readonly string[],
    layout: NaverImageLayout,
  ): Promise<NaverImageResponse> =>
    ipcRenderer.invoke(ipcChannels.naverAttachImages, { imageIds, layout }),
  focus: () => ipcRenderer.invoke(ipcChannels.naverFocus),
  close: () => ipcRenderer.invoke(ipcChannels.naverClose),
};

contextBridge.exposeInMainWorld('blowPoc', blowPocApi);
contextBridge.exposeInMainWorld('blowNaver', blowNaverApi);

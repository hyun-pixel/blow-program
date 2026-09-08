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
  NaverDividerStyleResult,
  NaverDividerStyleSelection,
  NaverDraftSaveResult,
  NaverEditorInputResult,
  NaverImageAttachmentResult,
  NaverImageLayout,
  NaverNetworkInterruptionTestResult,
  NaverStructureChangeTestResult,
  NaverSelectedImageFile,
  NaverQuoteInsertionResult,
  NaverQuotePosition,
  NaverQuoteStyleResult,
  NaverQuoteStyleSelection,
  NaverStickerCategoryResult,
  NaverStickerInsertionResult,
  NaverStickerPosition,
  NaverUserInteractionResult,
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

type NaverDividerStyleResponse =
  | {
      readonly ok: true;
      readonly result: NaverDividerStyleResult;
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

type NaverQuoteStyleResponse =
  | {
      readonly ok: true;
      readonly result: NaverQuoteStyleResult;
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

type NaverDraftSaveResponse =
  | {
      readonly ok: true;
      readonly result: NaverDraftSaveResult;
    }
  | {
      readonly ok: false;
      readonly error: {
        readonly code: string;
        readonly message: string;
      };
    };

type NaverStickerCategoryResponse =
  | {
      readonly ok: true;
      readonly result: NaverStickerCategoryResult;
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

type NaverNetworkInterruptionResponse =
  | {
      readonly ok: true;
      readonly result: NaverNetworkInterruptionTestResult;
    }
  | {
      readonly ok: false;
      readonly error: {
        readonly code: string;
        readonly message: string;
      };
    };

type NaverStructureChangeResponse =
  | {
      readonly ok: true;
      readonly result: NaverStructureChangeTestResult;
    }
  | {
      readonly ok: false;
      readonly error: {
        readonly code: string;
        readonly message: string;
      };
    };

type NaverUserInteractionResponse =
  | {
      readonly ok: true;
      readonly result: NaverUserInteractionResult;
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
  naverListDividerStyles: 'naver:list-divider-styles',
  naverInsertDivider: 'naver:insert-divider',
  naverListQuoteStyles: 'naver:list-quote-styles',
  naverInsertQuote: 'naver:insert-quote',
  naverSaveDraft: 'naver:save-draft',
  naverListStickerCategories: 'naver:list-sticker-categories',
  naverInsertSticker: 'naver:insert-sticker',
  naverSelectImages: 'naver:select-images',
  naverAttachImages: 'naver:attach-images',
  naverMonitorUserInteraction: 'naver:monitor-user-interaction',
  naverTestNetworkInterruption: 'naver:test-network-interruption',
  naverTestStructureChange: 'naver:test-structure-change',
  naverForceExitTest: 'naver:force-exit-test',
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
  listDividerStyles: (
    paragraphNumber: number,
    position: NaverDividerPosition,
  ): Promise<NaverDividerStyleResponse> =>
    ipcRenderer.invoke(ipcChannels.naverListDividerStyles, {
      paragraphNumber,
      position,
    }),
  insertDivider: (
    paragraphNumber: number,
    position: NaverDividerPosition,
    styleSelection?: NaverDividerStyleSelection,
  ): Promise<NaverDividerResponse> =>
    ipcRenderer.invoke(ipcChannels.naverInsertDivider, {
      paragraphNumber,
      position,
      styleSelection,
    }),
  listQuoteStyles: (
    paragraphNumber: number,
    position: NaverQuotePosition,
  ): Promise<NaverQuoteStyleResponse> =>
    ipcRenderer.invoke(ipcChannels.naverListQuoteStyles, {
      paragraphNumber,
      position,
    }),
  insertQuote: (
    paragraphNumber: number,
    position: NaverQuotePosition,
    styleSelection?: NaverQuoteStyleSelection,
  ): Promise<NaverQuoteResponse> =>
    ipcRenderer.invoke(ipcChannels.naverInsertQuote, {
      paragraphNumber,
      position,
      styleSelection,
    }),
  listStickerCategories: (
    paragraphNumber: number,
    position: NaverStickerPosition,
  ): Promise<NaverStickerCategoryResponse> =>
    ipcRenderer.invoke(ipcChannels.naverListStickerCategories, {
      paragraphNumber,
      position,
    }),
  saveDraft: (): Promise<NaverDraftSaveResponse> =>
    ipcRenderer.invoke(ipcChannels.naverSaveDraft),
  insertRandomSticker: (
    paragraphNumber: number,
    position: NaverStickerPosition,
    categoryId: string,
  ): Promise<NaverStickerResponse> =>
    ipcRenderer.invoke(ipcChannels.naverInsertSticker, {
      paragraphNumber,
      position,
      categoryId,
    }),
  selectImages: (): Promise<NaverImageSelectionResponse> =>
    ipcRenderer.invoke(ipcChannels.naverSelectImages),
  attachImages: (
    imageIds: readonly string[],
    layout: NaverImageLayout,
  ): Promise<NaverImageResponse> =>
    ipcRenderer.invoke(ipcChannels.naverAttachImages, { imageIds, layout }),
  monitorUserInteraction: (): Promise<NaverUserInteractionResponse> =>
    ipcRenderer.invoke(ipcChannels.naverMonitorUserInteraction),
  testNetworkInterruption: (): Promise<NaverNetworkInterruptionResponse> =>
    ipcRenderer.invoke(ipcChannels.naverTestNetworkInterruption),
  testStructureChange: (): Promise<NaverStructureChangeResponse> =>
    ipcRenderer.invoke(ipcChannels.naverTestStructureChange),
  forceExitTest: () => ipcRenderer.invoke(ipcChannels.naverForceExitTest),
  focus: () => ipcRenderer.invoke(ipcChannels.naverFocus),
  close: () => ipcRenderer.invoke(ipcChannels.naverClose),
};

contextBridge.exposeInMainWorld('blowPoc', blowPocApi);
contextBridge.exposeInMainWorld('blowNaver', blowNaverApi);

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
  NaverSavedDraftOpenResult,
  NaverStickerCategoryResult,
  NaverStickerInsertionResult,
  NaverStickerPosition,
  NaverUserInteractionResult,
} from '@blow/naver-adapter';
import type {
  CompatibilityEnvironmentResult,
  SlowNetworkTestResult,
  WriterNavigationRepeatProgress,
  WriterNavigationRepeatResult,
} from '../shared/compatibility-environment.js';
import type {
  BlogGenerationRequest,
  OpenAiGenerationResult,
} from '../main/openai-generation.js';
import type { TopicRecommendationRequest, TopicRecommendationResult } from '../main/openai-topic-recommendation.js';
import type {
  BlogImageGenerationRequest,
  OpenAiImageGenerationResult,
} from '../main/openai-image-generation.js';
import type {
  WorkHistoryEntry,
  WorkHistoryInput,
} from '../main/work-history.js';

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

type CompatibilityEnvironmentResponse =
  | {
      readonly ok: true;
      readonly result: CompatibilityEnvironmentResult;
    }
  | {
      readonly ok: false;
      readonly error: {
        readonly code: string;
        readonly message: string;
      };
    };

type WriterNavigationRepeatResponse =
  | {
      readonly ok: true;
      readonly result: WriterNavigationRepeatResult;
    }
  | {
      readonly ok: false;
      readonly error: {
        readonly code: string;
        readonly message: string;
      };
    };

type SlowNetworkResponse =
  | {
      readonly ok: true;
      readonly result: SlowNetworkTestResult;
    }
  | {
      readonly ok: false;
      readonly error: {
        readonly code: string;
        readonly message: string;
      };
    };

type OpenAiCredentialResponse =
  | {
      readonly ok: true;
      readonly status: {
        readonly saved: boolean;
      };
    }
  | {
      readonly ok: false;
      readonly error: {
        readonly code: string;
        readonly message: string;
      };
    };

type OpenAiConnectionResponse =
  | {
      readonly ok: true;
      readonly checkedAt: string;
    }
  | {
      readonly ok: false;
      readonly error: {
        readonly code: string;
        readonly message: string;
      };
    };

type OpenAiModelListResponse =
  | {
      readonly ok: true;
      readonly modelIds: readonly string[];
    }
  | {
      readonly ok: false;
      readonly error: {
        readonly code: string;
        readonly message: string;
      };
    };

type OpenAiGenerationCancelResponse = {
  readonly ok: true;
  readonly cancelled: boolean;
};

interface BrandProfileInput {
  readonly brandName: string;
  readonly industry: string;
  readonly brandIntroduction: string;
  readonly productsAndServices: string;
  readonly productPrices?: Readonly<Record<string, string>>;
  readonly contentDirection: string;
  readonly activityRegion: string;
  readonly priceInfo: string;
  readonly businessHours: string;
  readonly coreStrengths: string;
  readonly targetCustomers: string;
  readonly mustEmphasize: string;
  readonly prohibitedPhrases: string;
  readonly requiredPhrases: string;
  readonly defaultCta: string;
  readonly defaultTone: string;
  readonly accentColor: string;
  readonly imageStyle: string;
  readonly phoneNumber: string;
  readonly address: string;
  readonly consultationLink: string;
}

interface BrandProfile extends BrandProfileInput {
  readonly updatedAt: string;
}

type BrandProfileResponse =
  | {
      readonly ok: true;
      readonly profile: BrandProfile | null;
    }
  | {
      readonly ok: false;
      readonly error: {
        readonly code: string;
        readonly message: string;
      };
    };

type WorkHistoryListResponse =
  | {
      readonly ok: true;
      readonly entries: readonly WorkHistoryEntry[];
    }
  | {
      readonly ok: false;
      readonly error: {
        readonly code: string;
        readonly message: string;
      };
    };

type WorkHistoryAddResponse =
  | {
      readonly ok: true;
      readonly entry: WorkHistoryEntry;
    }
  | {
      readonly ok: false;
      readonly error: {
        readonly code: string;
        readonly message: string;
      };
    };

type WorkHistoryOpenDraftResponse =
  | {
      readonly ok: true;
      readonly result: NaverSavedDraftOpenResult;
    }
  | {
      readonly ok: false;
      readonly error: {
        readonly code: string;
        readonly message: string;
      };
    };
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
  brandProfileSave: 'brand-profile:save',
  brandProfileProductsSave: 'brand-profile:products-save',
  workHistoryList: 'work-history:list',
  workHistoryAdd: 'work-history:add',
  workHistoryDelete: 'work-history:delete',
  workHistoryOpenDraft: 'work-history:open-draft',
  openAiModelList: 'openai:model-list',
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

const blowSystemApi = {
  getAppVersion: (): Promise<string> =>
    ipcRenderer.invoke(ipcChannels.systemAppVersion),
  getDeviceHash: (): Promise<string> =>
    ipcRenderer.invoke(ipcChannels.systemDeviceHash),
};

const blowOpenAiApi = {
  getStatus: (): Promise<OpenAiCredentialResponse> =>
    ipcRenderer.invoke(ipcChannels.openAiCredentialStatus),
  save: (apiKey: string): Promise<OpenAiCredentialResponse> =>
    ipcRenderer.invoke(ipcChannels.openAiCredentialSave, apiKey),
  remove: (): Promise<OpenAiCredentialResponse> =>
    ipcRenderer.invoke(ipcChannels.openAiCredentialRemove),
  testConnection: (): Promise<OpenAiConnectionResponse> =>
    ipcRenderer.invoke(ipcChannels.openAiConnectionTest),
  listModels: (): Promise<OpenAiModelListResponse> =>
    ipcRenderer.invoke(ipcChannels.openAiModelList),
  recommendTopics: (input: TopicRecommendationRequest): Promise<TopicRecommendationResult> =>
    ipcRenderer.invoke(ipcChannels.openAiRecommendTopics, input),
  generateDraft: (
    input: BlogGenerationRequest,
  ): Promise<OpenAiGenerationResult> =>
    ipcRenderer.invoke(ipcChannels.openAiGenerateDraft, input),
  generateImages: (
    input: BlogImageGenerationRequest,
  ): Promise<OpenAiImageGenerationResult> =>
    ipcRenderer.invoke(ipcChannels.openAiGenerateImages, input),
  cancelGeneration: (): Promise<OpenAiGenerationCancelResponse> =>
    ipcRenderer.invoke(ipcChannels.openAiGenerationCancel),
};

const blowBrandProfileApi = {
  get: (userId: string): Promise<BrandProfileResponse> =>
    ipcRenderer.invoke(ipcChannels.brandProfileGet, userId),
  save: (
    userId: string,
    input: BrandProfileInput,
  ): Promise<BrandProfileResponse> =>
    ipcRenderer.invoke(ipcChannels.brandProfileSave, userId, input),
  saveProducts: (userId: string, items: readonly { readonly name: string; readonly price: string }[]): Promise<BrandProfileResponse> =>
    ipcRenderer.invoke(ipcChannels.brandProfileProductsSave, userId, items),
};

const blowWorkHistoryApi = {
  list: (userId: string): Promise<WorkHistoryListResponse> =>
    ipcRenderer.invoke(ipcChannels.workHistoryList, userId),
  add: (
    userId: string,
    input: WorkHistoryInput,
  ): Promise<WorkHistoryAddResponse> =>
    ipcRenderer.invoke(ipcChannels.workHistoryAdd, userId, input),
  remove: (
    userId: string,
    entryId: string,
  ): Promise<WorkHistoryListResponse> =>
    ipcRenderer.invoke(ipcChannels.workHistoryDelete, userId, entryId),
  openDraft: (
    userId: string,
    entryId: string,
  ): Promise<WorkHistoryOpenDraftResponse> =>
    ipcRenderer.invoke(ipcChannels.workHistoryOpenDraft, userId, entryId),
};

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
  prepareAutomaticWriter: (blogId: string) => ipcRenderer.invoke(ipcChannels.naverPrepareAutomaticWriter, blogId),
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
  prepareGeneratedImages: (
    dataUrls: readonly string[],
  ): Promise<NaverImageSelectionResponse> =>
    ipcRenderer.invoke(ipcChannels.naverPrepareGeneratedImages, dataUrls),
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
  inspectCompatibilityEnvironment: (): Promise<CompatibilityEnvironmentResponse> =>
    ipcRenderer.invoke(ipcChannels.naverInspectCompatibilityEnvironment),
  testWriterNavigationRepeat: (): Promise<WriterNavigationRepeatResponse> =>
    ipcRenderer.invoke(ipcChannels.naverTestWriterNavigationRepeat),
  testSlowNetwork: (): Promise<SlowNetworkResponse> =>
    ipcRenderer.invoke(ipcChannels.naverTestSlowNetwork),
  onWriterNavigationProgress: (
    listener: (progress: WriterNavigationRepeatProgress) => void,
  ) => {
    const handler = (
      _event: IpcRendererEvent,
      progress: WriterNavigationRepeatProgress,
    ): void => {
      listener(progress);
    };

    ipcRenderer.on(ipcChannels.naverWriterNavigationProgress, handler);

    return () => {
      ipcRenderer.removeListener(
        ipcChannels.naverWriterNavigationProgress,
        handler,
      );
    };
  },
  focus: () => ipcRenderer.invoke(ipcChannels.naverFocus),
  close: () => ipcRenderer.invoke(ipcChannels.naverClose),
};

contextBridge.exposeInMainWorld('blowSystem', blowSystemApi);
contextBridge.exposeInMainWorld('blowOpenAi', blowOpenAiApi);
contextBridge.exposeInMainWorld('blowPoc', blowPocApi);
contextBridge.exposeInMainWorld('blowNaver', blowNaverApi);
contextBridge.exposeInMainWorld('blowBrandProfile', blowBrandProfileApi);
contextBridge.exposeInMainWorld('blowWorkHistory', blowWorkHistoryApi);

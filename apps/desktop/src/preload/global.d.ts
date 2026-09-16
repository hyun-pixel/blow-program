import type { PocSnapshot } from '@blow/automation-core';
import type {
  DraftContent,
  DraftVerification,
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
import type {
  BlogImageGenerationRequest,
  OpenAiImageGenerationResult,
} from '../main/openai-image-generation.js';

interface PocErrorResponse {
  readonly ok: false;
  readonly snapshot?: PocSnapshot;
  readonly error: {
    readonly code: string;
    readonly message: string;
  };
}

interface PocSuccessResponse {
  readonly ok: true;
  readonly snapshot: PocSnapshot;
  readonly verification: DraftVerification;
}

interface NaverErrorResponse {
  readonly ok: false;
  readonly error: {
    readonly code: string;
    readonly message: string;
  };
}

interface NaverSuccessResponse {
  readonly ok: true;
  readonly status: NaverConnectionStatus;
}

interface NaverInputSuccessResponse {
  readonly ok: true;
  readonly result: NaverEditorInputResult;
}

interface NaverDividerStyleSuccessResponse {
  readonly ok: true;
  readonly result: NaverDividerStyleResult;
}

interface NaverDividerSuccessResponse {
  readonly ok: true;
  readonly result: NaverDividerInsertionResult;
}

interface NaverQuoteStyleSuccessResponse {
  readonly ok: true;
  readonly result: NaverQuoteStyleResult;
}

interface NaverQuoteSuccessResponse {
  readonly ok: true;
  readonly result: NaverQuoteInsertionResult;
}

interface NaverDraftSaveSuccessResponse {
  readonly ok: true;
  readonly result: NaverDraftSaveResult;
}

interface NaverStickerCategorySuccessResponse {
  readonly ok: true;
  readonly result: NaverStickerCategoryResult;
}

interface NaverStickerSuccessResponse {
  readonly ok: true;
  readonly result: NaverStickerInsertionResult;
}

interface NaverImageSelectionSuccessResponse {
  readonly ok: true;
  readonly canceled: boolean;
  readonly files: readonly NaverSelectedImageFile[];
}

interface NaverImageSuccessResponse {
  readonly ok: true;
  readonly result: NaverImageAttachmentResult;
}

interface NaverNetworkInterruptionSuccessResponse {
  readonly ok: true;
  readonly result: NaverNetworkInterruptionTestResult;
}

interface NaverStructureChangeSuccessResponse {
  readonly ok: true;
  readonly result: NaverStructureChangeTestResult;
}

interface NaverUserInteractionSuccessResponse {
  readonly ok: true;
  readonly result: NaverUserInteractionResult;
}

interface ForceExitTestSuccessResponse {
  readonly ok: true;
  readonly canceled: boolean;
}

interface CompatibilityEnvironmentSuccessResponse {
  readonly ok: true;
  readonly result: CompatibilityEnvironmentResult;
}

interface WriterNavigationRepeatSuccessResponse {
  readonly ok: true;
  readonly result: WriterNavigationRepeatResult;
}

interface SlowNetworkSuccessResponse {
  readonly ok: true;
  readonly result: SlowNetworkTestResult;
}

interface BasicSuccessResponse {
  readonly ok: true;
}

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

declare global {
  interface Window {
    readonly blowSystem: {
      getAppVersion(): Promise<string>;
      getDeviceHash(): Promise<string>;
    };
    readonly blowOpenAi: {
      getStatus(): Promise<OpenAiCredentialResponse>;
      save(apiKey: string): Promise<OpenAiCredentialResponse>;
      remove(): Promise<OpenAiCredentialResponse>;
      testConnection(): Promise<OpenAiConnectionResponse>;
      listModels(): Promise<OpenAiModelListResponse>;
      generateDraft(input: BlogGenerationRequest): Promise<OpenAiGenerationResult>;
      generateImages(input: BlogImageGenerationRequest): Promise<OpenAiImageGenerationResult>;
      cancelGeneration(): Promise<OpenAiGenerationCancelResponse>;
    };
    readonly blowBrandProfile: {
      get(userId: string): Promise<BrandProfileResponse>;
      save(
        userId: string,
        input: BrandProfileInput,
      ): Promise<BrandProfileResponse>;
    };
    readonly blowPoc: {
      start(): Promise<PocErrorResponse | PocSuccessResponse>;
      closeBrowser(): Promise<BasicSuccessResponse>;
      onState(listener: (snapshot: PocSnapshot) => void): () => void;
    };
    readonly blowNaver: {
      open(blogUrl: string): Promise<NaverErrorResponse | NaverSuccessResponse>;
      onState(
        listener: (
          response: NaverErrorResponse | NaverSuccessResponse,
        ) => void,
      ): () => void;
      verify(): Promise<NaverErrorResponse | NaverSuccessResponse>;
      openWriter(): Promise<NaverErrorResponse | NaverSuccessResponse>;
      enterContent(
        content: DraftContent,
      ): Promise<NaverErrorResponse | NaverInputSuccessResponse>;
      listDividerStyles(
        paragraphNumber: number,
        position: NaverDividerPosition,
      ): Promise<NaverErrorResponse | NaverDividerStyleSuccessResponse>;
      insertDivider(
        paragraphNumber: number,
        position: NaverDividerPosition,
        styleSelection?: NaverDividerStyleSelection,
      ): Promise<NaverErrorResponse | NaverDividerSuccessResponse>;
      listQuoteStyles(
        paragraphNumber: number,
        position: NaverQuotePosition,
      ): Promise<NaverErrorResponse | NaverQuoteStyleSuccessResponse>;
      insertQuote(
        paragraphNumber: number,
        position: NaverQuotePosition,
        styleSelection?: NaverQuoteStyleSelection,
      ): Promise<NaverErrorResponse | NaverQuoteSuccessResponse>;
      listStickerCategories(
        paragraphNumber: number,
        position: NaverStickerPosition,
      ): Promise<NaverErrorResponse | NaverStickerCategorySuccessResponse>;
      saveDraft(): Promise<
        NaverErrorResponse | NaverDraftSaveSuccessResponse
      >;
      insertRandomSticker(
        paragraphNumber: number,
        position: NaverStickerPosition,
        categoryId: string,
      ): Promise<NaverErrorResponse | NaverStickerSuccessResponse>;
      selectImages(): Promise<
        NaverErrorResponse | NaverImageSelectionSuccessResponse
      >;
      prepareGeneratedImages(
        dataUrls: readonly string[],
      ): Promise<NaverErrorResponse | NaverImageSelectionSuccessResponse>;
      attachImages(
        imageIds: readonly string[],
        layout: NaverImageLayout,
      ): Promise<NaverErrorResponse | NaverImageSuccessResponse>;
      monitorUserInteraction(): Promise<
        NaverErrorResponse | NaverUserInteractionSuccessResponse
      >;
      testNetworkInterruption(): Promise<
        NaverErrorResponse | NaverNetworkInterruptionSuccessResponse
      >;
      testStructureChange(): Promise<
        NaverErrorResponse | NaverStructureChangeSuccessResponse
      >;
      forceExitTest(): Promise<
        NaverErrorResponse | ForceExitTestSuccessResponse
      >;
      inspectCompatibilityEnvironment(): Promise<
        NaverErrorResponse | CompatibilityEnvironmentSuccessResponse
      >;
      testWriterNavigationRepeat(): Promise<
        NaverErrorResponse | WriterNavigationRepeatSuccessResponse
      >;
      testSlowNetwork(): Promise<
        NaverErrorResponse | SlowNetworkSuccessResponse
      >;
      onWriterNavigationProgress(
        listener: (progress: WriterNavigationRepeatProgress) => void,
      ): () => void;
      focus(): Promise<NaverErrorResponse | BasicSuccessResponse>;
      close(): Promise<BasicSuccessResponse>;
    };
  }
}

export {};

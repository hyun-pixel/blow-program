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

declare global {
  interface Window {
    readonly blowSystem: {
      getDeviceHash(): Promise<string>;
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

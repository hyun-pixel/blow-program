import type { PocSnapshot } from '@blow/automation-core';
import type {
  DraftContent,
  DraftVerification,
  NaverConnectionStatus,
  NaverEditorInputResult,
  NaverImageAttachmentResult,
  NaverImageLayout,
  NaverSelectedImageFile,
} from '@blow/naver-adapter';

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

interface NaverImageSelectionSuccessResponse {
  readonly ok: true;
  readonly canceled: boolean;
  readonly files: readonly NaverSelectedImageFile[];
}

interface NaverImageSuccessResponse {
  readonly ok: true;
  readonly result: NaverImageAttachmentResult;
}

interface BasicSuccessResponse {
  readonly ok: true;
}

declare global {
  interface Window {
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
      selectImages(): Promise<
        NaverErrorResponse | NaverImageSelectionSuccessResponse
      >;
      attachImages(
        imageIds: readonly string[],
        layout: NaverImageLayout,
      ): Promise<NaverErrorResponse | NaverImageSuccessResponse>;
      focus(): Promise<NaverErrorResponse | BasicSuccessResponse>;
      close(): Promise<BasicSuccessResponse>;
    };
  }
}

export {};

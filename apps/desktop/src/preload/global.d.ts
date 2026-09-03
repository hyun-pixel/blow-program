import type { PocSnapshot } from '@blow/automation-core';
import type { DraftVerification } from '@blow/naver-adapter';

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

declare global {
  interface Window {
    readonly blowPoc: {
      start(): Promise<PocErrorResponse | PocSuccessResponse>;
      closeBrowser(): Promise<{ readonly ok: true }>;
      onState(listener: (snapshot: PocSnapshot) => void): () => void;
    };
  }
}

export {};

export interface DraftContent {
  readonly title: string;
  readonly paragraphs: readonly string[];
}

export interface DraftVerification {
  readonly title: string;
  readonly body: string;
  readonly savedStatus: string;
}

export interface EditorAdapter {
  assertReady(): Promise<void>;
  enterTitle(title: string): Promise<void>;
  enterBody(paragraphs: readonly string[]): Promise<void>;
  verifyContent(expected: DraftContent): Promise<void>;
  saveDraft(): Promise<void>;
  verifyDraftSaved(): Promise<DraftVerification>;
}

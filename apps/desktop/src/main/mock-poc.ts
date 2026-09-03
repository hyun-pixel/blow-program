import { access, mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  PocStateMachine,
  type PocSnapshot,
} from '@blow/automation-core';
import {
  MockEditorAdapter,
  type DraftVerification,
} from '@blow/naver-adapter';
import {
  chromium,
  type BrowserContext,
} from 'playwright-core';

export interface MockPocOptions {
  readonly profilePath: string;
  readonly mockEditorPath: string;
  readonly headless: boolean;
  readonly keepBrowserOpen: boolean;
  readonly onSnapshot?: (snapshot: PocSnapshot) => void;
}

export interface MockPocResult {
  readonly snapshot: PocSnapshot;
  readonly verification: DraftVerification;
  closeBrowser(): Promise<void>;
}

export interface PocFailure {
  readonly code:
    | 'CHROME_NOT_FOUND'
    | 'PROFILE_IN_USE'
    | 'MOCK_EDITOR_NOT_FOUND'
    | 'CONTENT_MISMATCH'
    | 'POC_FAILED';
  readonly message: string;
}

export class MockPocError extends Error {
  constructor(
    readonly failure: PocFailure,
    readonly snapshot: PocSnapshot,
    options?: ErrorOptions,
  ) {
    super(failure.message, options);
    this.name = 'MockPocError';
  }
}

const sampleDraft = {
  title: '가을 웨딩 헤어를 준비하는 방법',
  paragraphs: [
    '상담 전에 원하는 분위기와 예식 장소를 정리하면 헤어 방향을 더 빠르게 결정할 수 있습니다.',
    '얼굴형과 드레스 목선을 함께 살펴보고, 저장한 참고 이미지는 담당자에게 미리 전달해 주세요.',
  ],
} as const;

function classifyFailure(error: unknown): PocFailure {
  const detail = error instanceof Error ? error.message : String(error);

  if (/executable.*doesn.t exist|chrome.*not found/i.test(detail)) {
    return {
      code: 'CHROME_NOT_FOUND',
      message: 'Chrome을 찾을 수 없습니다. Chrome 설치를 확인해 주세요.',
    };
  }

  if (/processsingleton|profile.*in use|user data directory is already in use/i.test(detail)) {
    return {
      code: 'PROFILE_IN_USE',
      message: 'BLOW 전용 Chrome이 이미 실행 중입니다.',
    };
  }

  if (/ENOENT|mock editor/i.test(detail)) {
    return {
      code: 'MOCK_EDITOR_NOT_FOUND',
      message: '가짜 편집기 파일을 찾을 수 없습니다.',
    };
  }

  if (/원본과 일치하지 않습니다/i.test(detail)) {
    return {
      code: 'CONTENT_MISMATCH',
      message: '입력 내용을 확인할 수 없어 작업을 멈췄습니다.',
    };
  }

  return {
    code: 'POC_FAILED',
    message: '자동 입력 테스트를 완료하지 못했습니다. 다시 시도해 주세요.',
  };
}

export async function runMockPoc(
  options: MockPocOptions,
): Promise<MockPocResult> {
  const machine = new PocStateMachine();
  let context: BrowserContext | undefined;

  const transition = (
    state: Parameters<PocStateMachine['transition']>[0],
    message: string,
  ): PocSnapshot => {
    const snapshot = machine.transition(state, message);
    options.onSnapshot?.(snapshot);
    return snapshot;
  };

  try {
    transition('PREFLIGHT', '실행 환경과 로컬 파일을 확인하고 있습니다.');
    await access(options.mockEditorPath);
    await mkdir(dirname(options.profilePath), { recursive: true });

    transition('OPEN_BROWSER', 'BLOW 전용 Chrome을 열고 있습니다.');
    context = await chromium.launchPersistentContext(options.profilePath, {
      channel: 'chrome',
      headless: options.headless,
      viewport: null,
    });

    const page = context.pages()[0] ?? (await context.newPage());
    await page.goto(pathToFileURL(options.mockEditorPath).href, {
      waitUntil: 'domcontentloaded',
    });

    const adapter = new MockEditorAdapter(page);

    await adapter.assertReady();
    transition('EDITOR_READY', '가짜 편집기의 입력 영역을 확인했습니다.');

    transition('TITLE_INPUT', '제목을 입력하고 결과를 확인하고 있습니다.');
    await adapter.enterTitle(sampleDraft.title);

    transition('BODY_INPUT', '본문을 문단 단위로 입력하고 있습니다.');
    await adapter.enterBody(sampleDraft.paragraphs);
    await adapter.verifyContent(sampleDraft);

    transition('TEMP_SAVE', '임시저장 버튼을 실행했습니다.');
    await adapter.saveDraft();

    transition('VERIFY_SAVE', '임시저장 완료 상태를 확인하고 있습니다.');
    const verification = await adapter.verifyDraftSaved();

    const snapshot = transition(
      'COMPLETED',
      '가짜 편집기의 임시저장 상태를 확인했습니다.',
    );

    if (!options.keepBrowserOpen) {
      await context.close();
      context = undefined;
    }

    return {
      snapshot,
      verification,
      closeBrowser: async () => {
        await context?.close();
        context = undefined;
      },
    };
  } catch (error) {
    const failure = classifyFailure(error);
    let snapshot = machine.snapshot();

    if (!snapshot.isTerminal) {
      snapshot = machine.fail(failure.message);
      options.onSnapshot?.(snapshot);
    }

    await context?.close().catch(() => undefined);

    throw new MockPocError(failure, snapshot, {
      cause: error,
    });
  }
}

import { getConnectedBlogId } from './naver-workflow.js';
import { WritingSteps } from './WritingSteps.js';
import { defaultPostDecorations, decorationPlacementLabel, resolveDecorationTargets, isDecorationStyleAvailable, type DecorationTarget, type PostDecorations } from './post-decoration.js';
import { DecorationPlacementFields } from './DecorationPlacementFields.js';
import {
  Check,
  CheckCircle2,
  Circle,
  CircleAlert,
  ExternalLink,
  FileText,
  Gauge,
  ImagePlus,
  Images,
  Keyboard,
  Link2,
  LoaderCircle,
  LogIn,
  Minus,
  MousePointerClick,
  PanelsTopLeft,
  Quote,
  Save,
  ShieldCheck,
  Sticker,
  WifiOff,
  X,
  XCircle,
} from 'lucide-react';
import {
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import type {
  NaverConnectionStatus,
  NaverDividerInsertionResult,
  NaverDividerStyle,
  NaverDividerStyleSelection,
  NaverDraftSaveResult,
  NaverEditorInputResult,
  NaverImageAttachmentResult,
  NaverImageLayout,
  NaverNetworkInterruptionTestResult,
  NaverStructureChangeTestResult,
  NaverSelectedImageFile,
  NaverQuoteInsertionResult,
  NaverQuoteStyle,
  NaverQuoteStyleSelection,
  NaverStickerCategory,
  NaverStickerInsertionResult,
  NaverUserInteractionResult,
  NaverUserInteractionType,
} from '@blow/naver-adapter';
import type {
  CompatibilityEnvironmentResult,
  SlowNetworkTestResult,
  WriterNavigationRepeatProgress,
  WriterNavigationRepeatResult,
} from '../shared/compatibility-environment.js';
import type { GeneratedBlogImage } from '../main/openai-image-generation.js';

type StepStatus = 'complete' | 'current' | 'pending' | 'failed';

type ActionName =
  | 'open'
  | 'verify'
  | 'writer'
  | 'input'
  | 'divider-styles'
  | 'divider'
  | 'sticker-categories'
  | 'sticker'
  | 'quote-styles'
  | 'quote'
  | 'save-draft'
  | 'interaction-monitor'
  | 'network-test'
  | 'structure-test'
  | 'force-exit-test'
  | 'environment-inspection'
  | 'writer-navigation-repeat'
  | 'slow-network-test'
  | 'select-images'
  | 'images'
  | 'focus';

function StepIcon({ status }: { readonly status: StepStatus }) {
  if (status === 'complete') {
    return <Check aria-hidden="true" />;
  }

  if (status === 'current') {
    return <LoaderCircle className="is-spinning" aria-hidden="true" />;
  }

  if (status === 'failed') {
    return <XCircle aria-hidden="true" />;
  }

  return <Circle aria-hidden="true" />;
}

const connectionSteps = [
  {
    label: '전용 Chrome 열기',
    description: 'BLOW 전용 프로필로 네이버 블로그 홈을 엽니다.',
  },
  {
    label: '네이버 로그인',
    description: '비밀번호는 Chrome에서 사용자가 직접 입력합니다.',
  },
  {
    label: '등록 블로그 확인',
    description: '로그인된 블로그와 입력한 주소를 비교합니다.',
  },
  {
    label: '글쓰기 진입 확인',
    description: '확인된 글쓰기 링크만 클릭하고 편집기 주소를 검사합니다.',
  },
] as const;

function getConnectionStepStatus(
  index: number,
  status: NaverConnectionStatus | null,
  isOpening: boolean,
): StepStatus {
  if (!status) {
    return index === 0 && isOpening ? 'current' : 'pending';
  }

  if (status.stage === 'LOGIN_REQUIRED') {
    return index === 0 ? 'complete' : index === 1 ? 'current' : 'pending';
  }

  if (status.stage === 'HOME_READY') {
    return index < 2 ? 'complete' : index === 2 ? 'current' : 'pending';
  }

  if (status.stage === 'BLOG_MISMATCH') {
    return index < 2 ? 'complete' : index === 2 ? 'failed' : 'pending';
  }

  if (status.stage === 'WRITER_LINK_READY') {
    return index < 3 ? 'complete' : 'current';
  }

  return 'complete';
}

function getUserInteractionLabel(type?: NaverUserInteractionType): string {
  if (type === 'pointer') {
    return '마우스 클릭';
  }

  if (type === 'keyboard') {
    return '키보드 입력';
  }

  if (type === 'text-input') {
    return '텍스트 입력';
  }

  if (type === 'scroll') {
    return '화면 스크롤';
  }

  return '감지되지 않음';
}

function safeHostLabel(value?: string): string {
  if (!value) {
    return '확인 전';
  }

  try {
    return new URL(value).hostname;
  } catch {
    return '확인 불가';
  }
}

const sampleTitle = '[BLOW] 네이버 편집기 입력 확인';
const sampleBody = [
  'BLOW가 제목과 본문 입력을 확인하는 예시 글입니다.',
  '한글·English·1234와 문장부호, 특수문자 입력을 확인합니다.',
  '빈 줄과 여러 문단이 그대로 유지되는지 확인합니다. 🙂',
].join('\n\n');

const imageLayoutOptions: readonly {
  readonly value: NaverImageLayout;
  readonly label: string;
  readonly description: string;
}[] = [
  {
    value: 'individual',
    label: '개별 사진',
    description: '각 이미지를 독립된 사진으로 배치합니다.',
  },
  {
    value: 'collage',
    label: '콜라주',
    description: '여러 이미지를 하나의 타일 구성으로 묶습니다.',
  },
  {
    value: 'slide',
    label: '슬라이드',
    description: '여러 이미지를 넘겨보는 한 묶음으로 배치합니다.',
  },
];

function getImageLayoutLabel(layout: NaverImageLayout): string {
  return imageLayoutOptions.find((option) => option.value === layout)!.label;
}

function formatFileSize(sizeBytes: number): string {
  if (sizeBytes < 1_024 * 1_024) {
    return `${Math.max(1, Math.round(sizeBytes / 1_024)).toLocaleString('ko-KR')} KB`;
  }

  return `${(sizeBytes / (1_024 * 1_024)).toFixed(1)} MB`;
}

function parseDraftParagraphs(value: string): readonly string[] {
  return value
    .replace(/\r\n?/g, '\n')
    .split(/\n+/)
    .map((paragraph) => paragraph.trim())
    .filter((paragraph) => paragraph.length > 0);
}

export function ConnectionScreen({
  userId,
  initialDraft,
  mode = 'draft',
  onConnectionChange,
  onBusyChange,
  onContinue,
  onBack,
  resetToken = 0,
}: {
  readonly userId: string;
  readonly mode?: 'setup' | 'draft';
  readonly onConnectionChange?: (blogId: string | null) => void;
  readonly onBusyChange?: (busy: boolean) => void;
  readonly onContinue?: () => void;
  readonly onBack?: () => void;
  readonly resetToken?: number;
  readonly initialDraft?: {
    readonly decorations?: PostDecorations;
    readonly title: string;
    readonly body: string;
    readonly images: readonly GeneratedBlogImage[];
    readonly modelId: string;
    readonly modelName: string;
    readonly reasoningEffort: string;
    readonly reasoningLabel: string;
    readonly settings: {
      readonly articleType: string;
      readonly targetLength: number;
      readonly useGeneratedImages: boolean;
      readonly imageCount: number;
      readonly imageAspectRatio: 'landscape' | 'portrait' | 'square';
      readonly imageQualityMode: 'economy' | 'quality';
      readonly imageStyle: string;
    };
  } | undefined;
}) {
  const isSetup = mode === 'setup';
  const showDiagnostics = import.meta.env.DEV;
  const loadedDraftRef = useRef(initialDraft);
  const [needsNewWriter, setNeedsNewWriter] = useState(false);
  const decorationPlan = initialDraft?.decorations;
  const [blogUrl, setBlogUrl] = useState('');
  const blogUrlInputRef = useRef<HTMLInputElement>(null);
  const draftTitleInputRef = useRef<HTMLInputElement>(null);
  const draftBodyInputRef = useRef<HTMLTextAreaElement>(null);
  const [status, setStatus] = useState<NaverConnectionStatus | null>(null);
  const [browserOpen, setBrowserOpen] = useState(false);
  const [draftTitle, setDraftTitle] = useState(
    initialDraft?.title ?? sampleTitle,
  );
  const [draftBody, setDraftBody] = useState(
    initialDraft?.body ?? sampleBody,
  );
  const [placements, setPlacements] = useState<PostDecorations>(decorationPlan ?? defaultPostDecorations);
  const [decorationProgress, setDecorationProgress] = useState({ divider: 0, quote: 0, sticker: 0 });
  const decorationStarted = useRef({ divider: false, quote: false, sticker: false });
  const resetDecorationProgress = (): void => {
    decorationStarted.current = { divider: false, quote: false, sticker: false };
    setDecorationProgress({ divider: 0, quote: 0, sticker: 0 });
  };
  // Freeze each random plan across style loading, progress updates, and other decoration edits.
  const dividerTargets = useMemo(() => resolveDecorationTargets(
    { enabled: true, count: placements.divider.count }, parseDraftParagraphs(draftBody),
  ), [placements.divider.count, draftBody]);
  const quoteTargets = useMemo(() => resolveDecorationTargets(
    { enabled: true, count: placements.quote.count }, parseDraftParagraphs(draftBody),
  ), [placements.quote.count, draftBody]);
  const stickerTargets = useMemo(() => resolveDecorationTargets(
    { enabled: true, count: placements.sticker.count }, parseDraftParagraphs(draftBody),
  ), [placements.sticker.count, draftBody]);
  const decorationTargets = { divider: dividerTargets, quote: quoteTargets, sticker: stickerTargets };
  const dividerParagraphNumber = decorationTargets.divider[0]?.paragraphNumber ?? 0;
  const quoteParagraphNumber = decorationTargets.quote[0]?.paragraphNumber ?? 0;
  const stickerParagraphNumber = decorationTargets.sticker[0]?.paragraphNumber ?? 0;
  const dividerPosition = 'after' as const;
  const quotePosition = 'after' as const;
  const stickerPosition = 'after' as const;
  const [draftErrors, setDraftErrors] = useState<{
    readonly title: string;
    readonly body: string;
  }>({
    title: '',
    body: '',
  });
  const [inputResult, setInputResult] =
    useState<NaverEditorInputResult | null>(null);
  const [draftSaveResult, setDraftSaveResult] =
    useState<NaverDraftSaveResult | null>(null);
  const [historySaveWarning, setHistorySaveWarning] = useState<string | null>(null);
  const [interactionResult, setInteractionResult] =
    useState<NaverUserInteractionResult | null>(null);
  const [interactionError, setInteractionError] = useState<string | null>(null);
  const [networkTestResult, setNetworkTestResult] =
    useState<NaverNetworkInterruptionTestResult | null>(null);
  const [networkTestError, setNetworkTestError] = useState<string | null>(null);
  const [structureTestResult, setStructureTestResult] =
    useState<NaverStructureChangeTestResult | null>(null);
  const [structureTestError, setStructureTestError] = useState<string | null>(null);
  const [compatibilityEnvironment, setCompatibilityEnvironment] =
    useState<CompatibilityEnvironmentResult | null>(null);
  const [compatibilityEnvironmentError, setCompatibilityEnvironmentError] =
    useState<string | null>(null);
  const [writerNavigationProgress, setWriterNavigationProgress] =
    useState<WriterNavigationRepeatProgress>({
      completedRuns: 0,
      totalRuns: 20,
    });
  const [writerNavigationResult, setWriterNavigationResult] =
    useState<WriterNavigationRepeatResult | null>(null);
  const [writerNavigationError, setWriterNavigationError] =
    useState<string | null>(null);
  const [slowNetworkResult, setSlowNetworkResult] =
    useState<SlowNetworkTestResult | null>(null);
  const [slowNetworkError, setSlowNetworkError] = useState<string | null>(null);
  const [dividerResult, setDividerResult] =
    useState<NaverDividerInsertionResult | null>(null);
  const [dividerStyles, setDividerStyles] = useState<
    readonly NaverDividerStyle[]
  >([]);
  const [dividerStyleSelection, setDividerStyleSelection] =
    useState<NaverDividerStyleSelection>(decorationPlan?.divider.style ?? 'random');
  const [stickerCategories, setStickerCategories] = useState<
    readonly NaverStickerCategory[]
  >([]);
  const [stickerCategoryId, setStickerCategoryId] = useState('');
  const [stickerResult, setStickerResult] =
    useState<NaverStickerInsertionResult | null>(null);
  const [quoteStyles, setQuoteStyles] = useState<
    readonly NaverQuoteStyle[]
  >([]);
  const [quoteStyleSelection, setQuoteStyleSelection] =
    useState<NaverQuoteStyleSelection>(decorationPlan?.quote.style ?? 'random');
  const [quoteResult, setQuoteResult] =
    useState<NaverQuoteInsertionResult | null>(null);
  const [selectedImages, setSelectedImages] = useState<
    readonly NaverSelectedImageFile[]
  >([]);
  const [imageLayout, setImageLayout] =
    useState<NaverImageLayout>('individual');
  const [imageResult, setImageResult] =
    useState<NaverImageAttachmentResult | null>(null);
  const [activeAction, setActiveAction] = useState<ActionName | null>(null);
  const [error, setError] = useState<{
    code: string;
    message: string;
  } | null>(null);
  const operationVersionRef = useRef(0);
  const sessionStoppedRef = useRef(false);
  const lastResetTokenRef = useRef(resetToken);
  const [isStopping, setIsStopping] = useState(false);
  const [stopNotice, setStopNotice] = useState(false);

  const isActivelyRunning = activeAction !== null || isStopping;
  const isInteractionPaused = error?.code === 'USER_INTERACTION_DETECTED';
  const requiresReauthentication = error?.code === 'NAVER_AUTH_REQUIRED';
  const isUiBusy =
    isActivelyRunning || isInteractionPaused || requiresReauthentication;
  const isAutoChecking =
    browserOpen &&
    !error &&
    (status?.stage === 'LOGIN_REQUIRED' || status?.stage === 'HOME_READY');
  const fieldError = error?.code === 'INVALID_BLOG_URL'
    ? error.message
    : null;

  const connectedBlogId = getConnectedBlogId(status, browserOpen, Boolean(error));

  useEffect(() => {
    if (lastResetTokenRef.current === resetToken) return;
    lastResetTokenRef.current = resetToken;
    operationVersionRef.current += 1;
    sessionStoppedRef.current = true;
    setStatus(null);
    setBrowserOpen(false);
    setInputResult(null);
    resetDecorationProgress();
    setDraftSaveResult(null);
    setImageResult(null);
    setSelectedImages([]);
    setDividerResult(null);
    setQuoteResult(null);
    setStickerResult(null);
    setDividerStyles([]);
    setQuoteStyles([]);
    setStickerCategories([]);
    setError({
      code: 'NAVER_SESSION_CHANGED',
      message: '작업 내역에서 다른 임시글을 열었습니다. 새 글을 이어 쓰려면 네이버를 다시 연결해 주세요. 작성한 내용은 유지됩니다.',
    });
  }, [resetToken]);

  useEffect(() => {
    onConnectionChange?.(connectedBlogId);
  }, [connectedBlogId, onConnectionChange]);

  useEffect(() => {
    onBusyChange?.(isActivelyRunning);
  }, [isActivelyRunning, onBusyChange]);

  useEffect(() => {
    // Keep one connection mounted across settings, composition, and transfer.
    if (!initialDraft || loadedDraftRef.current === initialDraft) return;
    setNeedsNewWriter(Boolean(loadedDraftRef.current));
    loadedDraftRef.current = initialDraft;
    const plan = initialDraft.decorations;
    setPlacements(initialDraft.decorations ?? defaultPostDecorations);
    setDraftTitle(initialDraft.title);
    setDraftBody(initialDraft.body);
    setDraftErrors({ title: '', body: '' });
    setInputResult(null);
    resetDecorationProgress();
    setDraftSaveResult(null);
    setHistorySaveWarning(null);
    setSelectedImages([]);
    setImageResult(null);
    setImageLayout('individual');
    setDividerStyles([]);
    setDividerResult(null);
    setDividerStyleSelection(plan?.divider.style ?? 'random');


    setQuoteStyles([]);
    setQuoteResult(null);
    setQuoteStyleSelection(plan?.quote.style ?? 'random');


    setStickerCategories([]);
    setStickerCategoryId('');
    setStickerResult(null);


  }, [initialDraft]);

  const beginOperation = (action: ActionName): number => {
    const operationVersion = operationVersionRef.current;
    setActiveAction(action);
    setStopNotice(false);
    return operationVersion;
  };

  const isOperationCurrent = (operationVersion: number): boolean =>
    operationVersion === operationVersionRef.current;

  const finishOperation = (operationVersion: number): void => {
    if (isOperationCurrent(operationVersion)) {
      setActiveAction(null);
    }
  };

  useEffect(() => {
    if (fieldError) {
      blogUrlInputRef.current?.focus();
    }
  }, [fieldError]);

  useEffect(() => {
    return window.blowNaver.onState((response) => {
      if (sessionStoppedRef.current) {
        return;
      }

      if (response.ok) {
        setBrowserOpen(true);
        setStatus(response.status);
        setError(null);
        return;
      }

      setError(response.error);

      if (response.error.code === 'BROWSER_CLOSED') {
        setBrowserOpen(false);
        setStatus(null);
      }
    });
  }, []);

  useEffect(() => {
    return window.blowNaver.onWriterNavigationProgress((progress) => {
      if (!sessionStoppedRef.current) {
        setWriterNavigationProgress(progress);
      }
    });
  }, []);

  const runConnectionCommand = async (
    action: 'open' | 'verify' | 'writer',
    command: () => ReturnType<typeof window.blowNaver.open>,
  ): Promise<NaverConnectionStatus | null> => {
    const operationVersion = beginOperation(action);
    setError(null);

    try {
      const response = await command();

      if (!isOperationCurrent(operationVersion)) {
        return null;
      }

      if (response.ok) {
        setStatus(response.status);

        if (action === 'open') {
          setBrowserOpen(true);
        }

        if (action === 'open' || action === 'writer') setNeedsNewWriter(false);
        if (action !== 'open' && response.status.stage === 'LOGIN_REQUIRED') {
          setError({ code: 'NAVER_AUTH_REQUIRED', message: 'Chrome에서 로그인한 뒤 ‘연결 다시 확인’을 눌러 주세요.' });
        }

        if (action === 'open' || action === 'writer') {
          setInputResult(null);
          resetDecorationProgress();


          setDividerStyles([]);
          setDividerStyleSelection(decorationPlan?.divider.style ?? 'random');
          setDividerResult(null);


          setStickerCategories([]);
          setStickerCategoryId('');
          setStickerResult(null);


          setQuoteStyles([]);
          setQuoteStyleSelection(decorationPlan?.quote.style ?? 'random');
          setQuoteResult(null);
          setDraftSaveResult(null);
          setInteractionResult(null);
          setInteractionError(null);
          setNetworkTestResult(null);
          setNetworkTestError(null);
          setStructureTestResult(null);
          setStructureTestError(null);
          setCompatibilityEnvironment(null);
          setCompatibilityEnvironmentError(null);
          setWriterNavigationProgress({ completedRuns: 0, totalRuns: 20 });
          setWriterNavigationResult(null);
          setWriterNavigationError(null);
          setSlowNetworkResult(null);
          setSlowNetworkError(null);
          setSelectedImages([]);
          setImageLayout('individual');
          setImageResult(null);
        }
        return response.status;
      } else {
        setError(response.error);

        if (
          action === 'open' ||
          response.error.code === 'BROWSER_CLOSED'
        ) {
          setBrowserOpen(false);
          setStatus(null);
        }
      }
    } catch {
      if (!isOperationCurrent(operationVersion)) {
        return null;
      }

      setError({
        code: 'NAVER_CONNECTION_FAILED',
        message: '네이버 연결 상태를 확인하지 못했습니다. 다시 시도해 주세요.',
      });
    } finally {
      finishOperation(operationVersion);
    }
    return null;
  };

  const openVerifiedWriter = async (): Promise<void> => {
    if (needsNewWriter && !window.confirm('새 글쓰기 화면을 열면 현재 네이버 편집기를 벗어납니다. 기존 글을 먼저 임시저장했는지 확인해 주세요. 새 글쓰기 화면을 열까요?')) return;
    // verify() navigates to the blog home: never run it over an in-progress editor automatically.
    const verified = await runConnectionCommand('verify', () => window.blowNaver.verify());
    if (getConnectedBlogId(verified, true, false) && verified?.stage === 'WRITER_LINK_READY') {
      await runConnectionCommand('writer', () => window.blowNaver.openWriter());
    }
  };

  const submitConnection = (): void => {
    if (!browserOpen) {
      sessionStoppedRef.current = false;
      void runConnectionCommand(
        'open',
        () => window.blowNaver.open(blogUrl),
      );
      return;
    }

    if (requiresReauthentication) {
      void runConnectionCommand(
        'verify',
        () => window.blowNaver.verify(),
      );
      return;
    }

    if (!isSetup && (status?.stage === 'WRITER_LINK_READY' || needsNewWriter)) {
      void openVerifiedWriter();
      return;
    }

    if (status?.stage !== 'WRITER_READY') {
      void runConnectionCommand(
        'verify',
        () => window.blowNaver.verify(),
      );
    }
  };

  const focusChrome = async (): Promise<void> => {
    const operationVersion = beginOperation('focus');

    try {
      const response = await window.blowNaver.focus();

      if (!isOperationCurrent(operationVersion)) {
        return;
      }

      if (!response.ok) {
        setError(response.error);
      }
    } catch {
      if (!isOperationCurrent(operationVersion)) {
        return;
      }

      setError({
        code: 'NAVER_CONNECTION_FAILED',
        message: '전용 Chrome 창을 찾지 못했습니다.',
      });
    } finally {
      finishOperation(operationVersion);
    }
  };

  const stopWork = async (): Promise<void> => {
    operationVersionRef.current += 1;
    sessionStoppedRef.current = true;
    setActiveAction(null);
    setIsStopping(true);
    setStopNotice(false);
    setError(null);

    try {
      await window.blowNaver.close();
      setBrowserOpen(false);
      setStatus(null);
      setInputResult(null);
      resetDecorationProgress();


      setDividerStyles([]);
      setDividerStyleSelection(decorationPlan?.divider.style ?? 'random');
      setDividerResult(null);


      setStickerCategories([]);
      setStickerCategoryId('');
      setStickerResult(null);


      setQuoteStyles([]);
      setQuoteStyleSelection(decorationPlan?.quote.style ?? 'random');
      setQuoteResult(null);
      setDraftSaveResult(null);
      setInteractionResult(null);
      setInteractionError(null);
      setNetworkTestResult(null);
      setNetworkTestError(null);
      setStructureTestResult(null);
      setStructureTestError(null);
      setCompatibilityEnvironment(null);
      setCompatibilityEnvironmentError(null);
      setWriterNavigationProgress({ completedRuns: 0, totalRuns: 20 });
      setWriterNavigationResult(null);
      setWriterNavigationError(null);
      setSlowNetworkResult(null);
      setSlowNetworkError(null);
      setSelectedImages([]);
      setImageLayout('individual');
      setImageResult(null);
      setDraftErrors({ title: '', body: '' });
      setStopNotice(true);
    } catch {
      sessionStoppedRef.current = false;
      setError({
        code: 'AUTOMATION_STOP_FAILED',
        message: '작업을 중단하지 못했습니다. 전용 Chrome을 직접 닫아 주세요.',
      });
    } finally {
      setIsStopping(false);
    }
  };

  const runEditorInput = async (): Promise<void> => {
    const title = draftTitle.trim();
    const paragraphs = parseDraftParagraphs(draftBody);
    const nextErrors = {
      title: title ? '' : '입력할 제목을 작성해 주세요.',
      body: paragraphs.length > 0
        ? ''
        : '입력할 본문을 작성해 주세요.',
    };

    setDraftErrors(nextErrors);

    if (nextErrors.title) {
      draftTitleInputRef.current?.focus();
      return;
    }

    if (nextErrors.body) {
      draftBodyInputRef.current?.focus();
      return;
    }

    const operationVersion = beginOperation('input');
    setInputResult(null);
    resetDecorationProgress();
    setDividerStyles([]);
    setDividerStyleSelection(decorationPlan?.divider.style ?? 'random');
    setDividerResult(null);
    setStickerCategories([]);
    setStickerCategoryId('');
    setStickerResult(null);


    setQuoteStyles([]);
    setQuoteStyleSelection(decorationPlan?.quote.style ?? 'random');
    setQuoteResult(null);
    setDraftSaveResult(null);
    setInteractionResult(null);
    setInteractionError(null);
    setError(null);

    try {
      const response = await window.blowNaver.enterContent({
        title,
        paragraphs,
      });

      if (!isOperationCurrent(operationVersion)) {
        return;
      }

      if (response.ok) {
        setInputResult(response.result);


        setDividerStyles([]);
        setDividerStyleSelection(decorationPlan?.divider.style ?? 'random');
        setDividerResult(null);
        if (initialDraft?.images.length) {
          const imageResponse = await window.blowNaver.prepareGeneratedImages(
            initialDraft.images.map((image) => image.dataUrl),
          );

          if (!isOperationCurrent(operationVersion)) {
            return;
          }

          if (imageResponse.ok) {
            setSelectedImages(imageResponse.files);
          } else {
            setSelectedImages([]);
            setError(imageResponse.error);
          }
        } else {
          setSelectedImages([]);
        }
        setImageResult(null);
      } else {
        setError(response.error);
      }
    } catch {
      if (!isOperationCurrent(operationVersion)) {
        return;
      }

      setError({
        code: 'NAVER_CONNECTION_FAILED',
        message: '제목과 본문 입력을 완료하지 못했습니다. Chrome 화면을 확인해 주세요.',
      });
    } finally {
      finishOperation(operationVersion);
    }
  };

  const selectImages = async (): Promise<void> => {
    const operationVersion = beginOperation('select-images');
    setError(null);

    try {
      const response = await window.blowNaver.selectImages();

      if (!isOperationCurrent(operationVersion)) {
        return;
      }

      if (response.ok) {
        if (!response.canceled) {
          setSelectedImages(response.files);
          setImageResult(null);
        }
      } else {
        setError(response.error);
      }
    } catch {
      if (!isOperationCurrent(operationVersion)) {
        return;
      }

      setError({
        code: 'INVALID_IMAGE_SELECTION',
        message: '이미지 파일 선택 창을 열지 못했습니다. 다시 시도해 주세요.',
      });
    } finally {
      finishOperation(operationVersion);
    }
  };

  const attachImages = async (): Promise<void> => {
    if (selectedImages.length === 0) {
      setError({
        code: 'INVALID_IMAGE_SELECTION',
        message: '첨부할 JPG 또는 PNG 이미지를 선택해 주세요.',
      });
      return;
    }

    if (imageLayout !== 'individual' && selectedImages.length < 2) {
      setError({
        code: 'INVALID_IMAGE_SELECTION',
        message: `${getImageLayoutLabel(imageLayout)}는 이미지를 2장 이상 선택해야 합니다.`,
      });
      return;
    }

    const operationVersion = beginOperation('images');
    setImageResult(null);
    setError(null);

    try {
      const response = await window.blowNaver.attachImages(
        selectedImages.map((image) => image.id),
        imageLayout,
      );

      if (!isOperationCurrent(operationVersion)) {
        return;
      }

      if (response.ok) {
        setImageResult(response.result);
        setDraftSaveResult(null);
      } else {
        setError(response.error);
      }
    } catch {
      if (!isOperationCurrent(operationVersion)) {
        return;
      }

      setError({
        code: 'IMAGE_UPLOAD_FAILED',
        message: '이미지 첨부를 완료하지 못했습니다. Chrome 화면을 확인해 주세요.',
      });
    } finally {
      finishOperation(operationVersion);
    }
  };

  const loadDividerStyles = async (): Promise<void> => {
    if (
      dividerParagraphNumber < 1 ||
      dividerParagraphNumber > draftParagraphs.length
    ) {
      setError({
        code: 'INVALID_DIVIDER_REQUEST',
        message: '구분선을 넣을 배치 설정을 확인해 주세요.',
      });
      return;
    }

    const operationVersion = beginOperation('divider-styles');
    setDividerStyles([]);
    setError(null);

    try {
      const response = await window.blowNaver.listDividerStyles(
        dividerParagraphNumber,
        dividerPosition,
      );

      if (!isOperationCurrent(operationVersion)) {
        return;
      }

      if (response.ok) {
        setDividerStyles(response.result.styles);
      } else {
        setError(response.error);
      }
    } catch {
      if (!isOperationCurrent(operationVersion)) {
        return;
      }

      setError({
        code: 'DIVIDER_STYLE_NOT_FOUND',
        message: '구분선 디자인을 불러오지 못했습니다. Chrome 화면을 확인해 주세요.',
      });
    } finally {
      finishOperation(operationVersion);
    }
  };

  const runDecorationInsert = async <T,>(
    kind: keyof PostDecorations,
    insert: (target: DecorationTarget) => Promise<{ ok: true; result: T } | { ok: false; error: { code: string; message: string } }>,
    onComplete: (result: T) => void,
  ): Promise<void> => {
    if (isUiBusy || decorationStarted.current[kind] || !decorationTargets[kind].length) return;
    decorationStarted.current[kind] = true;
    const operationVersion = beginOperation(kind);
    setError(null);
    setDraftSaveResult(null);
    try {
      const targets = decorationTargets[kind];
      for (let index = 0; index < targets.length; index += 1) {
        if (!isOperationCurrent(operationVersion)) return;
        const response = await insert(targets[index]!);
        if (!isOperationCurrent(operationVersion)) return;
        if (!response.ok) {
          setError(response.error);
          return;
        }
        setDecorationProgress((current) => ({ ...current, [kind]: index + 1 }));
        if (index === targets.length - 1) onComplete(response.result);
      }
    } catch {
      if (isOperationCurrent(operationVersion)) setError({
        code: `${kind.toUpperCase()}_INSERT_UNCONFIRMED`,
        message: '삽입 결과를 확인하지 못해 남은 작업을 멈췄습니다. 자동 재시도하지 않습니다. Chrome에서 결과를 확인해 주세요.',
      });
    } finally {
      finishOperation(operationVersion);
    }
  };

  const insertDivider = async (): Promise<void> => {
    if (!isDecorationStyleAvailable(dividerStyleSelection, dividerStyles)) {
      setError({ code: 'DIVIDER_STYLE_NOT_FOUND', message: '구분선 목록을 확인하고 사용 가능한 디자인을 선택해 주세요.' });
      return;
    }
    await runDecorationInsert('divider', (target) => window.blowNaver.insertDivider(
      target.paragraphNumber, target.position, dividerStyleSelection,
    ), setDividerResult);
  };

  const loadStickerCategories = async (): Promise<void> => {
    if (
      stickerParagraphNumber < 1 ||
      stickerParagraphNumber > draftParagraphs.length
    ) {
      setError({
        code: 'INVALID_STICKER_REQUEST',
        message: '스티커를 넣을 배치 설정을 확인해 주세요.',
      });
      return;
    }

    const operationVersion = beginOperation('sticker-categories');
    setStickerCategories([]);
    setStickerCategoryId('');
    setStickerResult(null);
    setDraftSaveResult(null);
    setError(null);

    try {
      const response = await window.blowNaver.listStickerCategories(
        stickerParagraphNumber,
        stickerPosition,
      );

      if (!isOperationCurrent(operationVersion)) {
        return;
      }

      if (response.ok) {
        setStickerCategories(response.result.categories);
        if (decorationPlan?.sticker.categoryMode === 'random') {
          const categories = response.result.categories;
          setStickerCategoryId(categories[Math.floor(Math.random() * categories.length)]?.id ?? '');
        }
      } else {
        setError(response.error);
      }
    } catch {
      if (!isOperationCurrent(operationVersion)) {
        return;
      }

      setError({
        code: 'STICKER_CATEGORY_NOT_FOUND',
        message: '스티커 묶음을 불러오지 못했습니다. Chrome 화면을 확인해 주세요.',
      });
    } finally {
      finishOperation(operationVersion);
    }
  };

  const insertRandomSticker = async (): Promise<void> => {
    if (!stickerCategoryId) {
      setError({ code: 'INVALID_STICKER_REQUEST', message: '사용할 스티커 묶음을 선택해 주세요.' });
      return;
    }
    await runDecorationInsert('sticker', (target) => window.blowNaver.insertRandomSticker(
      target.paragraphNumber, target.position, stickerCategoryId,
    ), setStickerResult);
  };

  const loadQuoteStyles = async (): Promise<void> => {
    if (
      quoteParagraphNumber < 1 ||
      quoteParagraphNumber > draftParagraphs.length
    ) {
      setError({
        code: 'INVALID_QUOTE_REQUEST',
        message: '인용구를 넣을 배치 설정을 확인해 주세요.',
      });
      return;
    }

    const operationVersion = beginOperation('quote-styles');
    setQuoteStyles([]);
    setQuoteResult(null);
    setDraftSaveResult(null);
    setError(null);

    try {
      const response = await window.blowNaver.listQuoteStyles(
        quoteParagraphNumber,
        quotePosition,
      );

      if (!isOperationCurrent(operationVersion)) {
        return;
      }

      if (response.ok) {
        setQuoteStyles(response.result.styles);
      } else {
        setError(response.error);
      }
    } catch {
      if (!isOperationCurrent(operationVersion)) {
        return;
      }

      setError({
        code: 'QUOTE_STYLE_NOT_FOUND',
        message: '인용구 디자인을 불러오지 못했습니다. Chrome 화면을 확인해 주세요.',
      });
    } finally {
      finishOperation(operationVersion);
    }
  };

  const insertQuote = async (): Promise<void> => {
    if (!isDecorationStyleAvailable(quoteStyleSelection, quoteStyles)) {
      setError({ code: 'QUOTE_STYLE_NOT_FOUND', message: '인용구 목록을 확인하고 사용 가능한 디자인을 선택해 주세요.' });
      return;
    }
    await runDecorationInsert('quote', (target) => window.blowNaver.insertQuote(
      target.paragraphNumber, target.position, quoteStyleSelection,
    ), setQuoteResult);
  };

  const saveDraft = async (): Promise<void> => {
    const operationVersion = beginOperation('save-draft');
    setDraftSaveResult(null);
    setHistorySaveWarning(null);
    setError(null);

    try {
      const response = await window.blowNaver.saveDraft();

      if (!isOperationCurrent(operationVersion)) {
        return;
      }

      if (response.ok) {
        setDraftSaveResult(response.result);
        if (initialDraft) {
          const historyResponse = await window.blowWorkHistory.add(userId, {
            title: draftTitle,
            body: draftBody,
            modelId: initialDraft.modelId,
            modelName: initialDraft.modelName,
            reasoningEffort: initialDraft.reasoningEffort,
            reasoningLabel: initialDraft.reasoningLabel,
            imageCount: imageResult?.insertedCount ?? 0,
            naverUrl: response.result.currentUrl,
            settings: initialDraft.settings,
          });

          if (!historyResponse.ok) {
            setHistorySaveWarning(historyResponse.error.message);
          }
        }
      } else {
        setError(response.error);
      }
    } catch {
      if (!isOperationCurrent(operationVersion)) {
        return;
      }

      setError({
        code: 'DRAFT_SAVE_UNCONFIRMED',
        message: '임시저장 완료 상태를 확인하지 못했습니다. 자동으로 다시 누르지 않았으니 Chrome에서 저장 여부를 확인해 주세요.',
      });
    } finally {
      finishOperation(operationVersion);
    }
  };

  const testNetworkInterruption = async (): Promise<void> => {
    const operationVersion = beginOperation('network-test');
    setNetworkTestResult(null);
    setNetworkTestError(null);
    setStructureTestResult(null);
    setStructureTestError(null);
    setError(null);

    try {
      const response = await window.blowNaver.testNetworkInterruption();

      if (!isOperationCurrent(operationVersion)) {
        return;
      }

      if (response.ok) {
        setNetworkTestResult(response.result);
      } else {
        setNetworkTestError(response.error.message);

        if (response.error.code === 'BROWSER_CLOSED') {
          setBrowserOpen(false);
          setStatus(null);
          setError(response.error);
        }
      }
    } catch {
      if (!isOperationCurrent(operationVersion)) {
        return;
      }

      setNetworkTestError(
        '네트워크 끊김 감지를 완료하지 못했습니다. 전용 Chrome을 확인해 주세요.',
      );
    } finally {
      finishOperation(operationVersion);
    }
  };

  const forceExitTest = async (): Promise<void> => {
    const operationVersion = beginOperation('force-exit-test');
    setError(null);

    try {
      const response = await window.blowNaver.forceExitTest();

      if (!isOperationCurrent(operationVersion)) {
        return;
      }

      if (!response.ok) {
        setError(response.error);
        finishOperation(operationVersion);
        return;
      }

      if (response.canceled) {
        finishOperation(operationVersion);
      }
    } catch {
      if (!isOperationCurrent(operationVersion)) {
        return;
      }

      setError({
        code: 'FORCE_EXIT_TEST_FAILED',
        message: '강제 종료 테스트를 시작하지 못했습니다. 다시 시도해 주세요.',
      });
      finishOperation(operationVersion);
    }
  };

  const inspectCompatibilityEnvironment = async (): Promise<void> => {
    const operationVersion = beginOperation('environment-inspection');
    setCompatibilityEnvironment(null);
    setCompatibilityEnvironmentError(null);
    setError(null);

    try {
      const response = await window.blowNaver.inspectCompatibilityEnvironment();

      if (!isOperationCurrent(operationVersion)) {
        return;
      }

      if (response.ok) {
        setCompatibilityEnvironment(response.result);
      } else {
        setCompatibilityEnvironmentError(response.error.message);

        if (response.error.code === 'BROWSER_CLOSED') {
          setBrowserOpen(false);
          setStatus(null);
          setError(response.error);
        }
      }
    } catch {
      if (!isOperationCurrent(operationVersion)) {
        return;
      }

      setCompatibilityEnvironmentError(
        '현재 테스트 환경을 확인하지 못했습니다. 다시 시도해 주세요.',
      );
    } finally {
      finishOperation(operationVersion);
    }
  };

  const testWriterNavigationRepeat = async (): Promise<void> => {
    const operationVersion = beginOperation('writer-navigation-repeat');
    setWriterNavigationProgress({ completedRuns: 0, totalRuns: 20 });
    setWriterNavigationResult(null);
    setWriterNavigationError(null);
    setError(null);

    try {
      const response = await window.blowNaver.testWriterNavigationRepeat();

      if (!isOperationCurrent(operationVersion)) {
        return;
      }

      if (response.ok) {
        setWriterNavigationResult(response.result);
        setWriterNavigationProgress(response.result);
      } else {
        setWriterNavigationError(response.error.message);

        if (
          response.error.code === 'BROWSER_CLOSED' ||
          response.error.code === 'NAVER_AUTH_REQUIRED'
        ) {
          if (response.error.code === 'BROWSER_CLOSED') {
            setBrowserOpen(false);
            setStatus(null);
          }

          setError(response.error);
        }
      }
    } catch {
      if (!isOperationCurrent(operationVersion)) {
        return;
      }

      setWriterNavigationError(
        '글쓰기 화면 반복 진입을 완료하지 못했습니다. 다시 시도해 주세요.',
      );
    } finally {
      finishOperation(operationVersion);
    }
  };

  const testSlowNetwork = async (): Promise<void> => {
    const operationVersion = beginOperation('slow-network-test');
    setSlowNetworkResult(null);
    setSlowNetworkError(null);
    setError(null);

    try {
      const response = await window.blowNaver.testSlowNetwork();

      if (!isOperationCurrent(operationVersion)) {
        return;
      }

      if (response.ok) {
        setSlowNetworkResult(response.result);
      } else {
        setSlowNetworkError(response.error.message);

        if (
          response.error.code === 'BROWSER_CLOSED' ||
          response.error.code === 'NAVER_AUTH_REQUIRED' ||
          response.error.code === 'NAVER_NETWORK_ERROR'
        ) {
          if (response.error.code === 'BROWSER_CLOSED') {
            setBrowserOpen(false);
            setStatus(null);
          }

          setError(response.error);
        }
      }
    } catch {
      if (!isOperationCurrent(operationVersion)) {
        return;
      }

      setSlowNetworkError(
        '느린 네트워크 대응을 확인하지 못했습니다. 전용 Chrome을 확인해 주세요.',
      );
    } finally {
      finishOperation(operationVersion);
    }
  };

  const testStructureChange = async (): Promise<void> => {
    const operationVersion = beginOperation('structure-test');
    setStructureTestResult(null);
    setStructureTestError(null);
    setNetworkTestResult(null);
    setNetworkTestError(null);
    setInteractionResult(null);
    setInteractionError(null);
    setError(null);

    try {
      const response = await window.blowNaver.testStructureChange();

      if (!isOperationCurrent(operationVersion)) {
        return;
      }

      if (response.ok) {
        setStructureTestResult(response.result);
      } else {
        setStructureTestError(response.error.message);

        if (
          response.error.code === 'BROWSER_CLOSED' ||
          response.error.code === 'NAVER_AUTH_REQUIRED' ||
          response.error.code === 'NAVER_NETWORK_ERROR'
        ) {
          if (response.error.code === 'BROWSER_CLOSED') {
            setBrowserOpen(false);
            setStatus(null);
          }

          setError(response.error);
        }
      }
    } catch {
      if (!isOperationCurrent(operationVersion)) {
        return;
      }

      setStructureTestError(
        '화면 구조 변경 시 안전 중단을 확인하지 못했습니다. 전용 Chrome을 확인해 주세요.',
      );
    } finally {
      finishOperation(operationVersion);
    }
  };

  const monitorUserInteraction = async (): Promise<void> => {
    const operationVersion = beginOperation('interaction-monitor');
    setInteractionResult(null);
    setInteractionError(null);
    setError(null);

    try {
      const response = await window.blowNaver.monitorUserInteraction();

      if (!isOperationCurrent(operationVersion)) {
        return;
      }

      if (response.ok) {
        setInteractionResult(response.result);
      } else {
        setInteractionError(response.error.message);

        if (response.error.code === 'BROWSER_CLOSED') {
          setBrowserOpen(false);
          setStatus(null);
          setError(response.error);
        }
      }
    } catch {
      if (!isOperationCurrent(operationVersion)) {
        return;
      }

      setInteractionError(
        '사용자 조작 감지를 완료하지 못했습니다. 전용 Chrome을 확인해 주세요.',
      );
    } finally {
      finishOperation(operationVersion);
    }
  };
  const actionLabel = activeAction === 'open'
    ? 'Chrome 여는 중…'
    : activeAction === 'verify'
      ? '연결 확인 중…'
      : activeAction === 'writer'
        ? '글쓰기 화면 확인 중…'
        : isAutoChecking
          ? '로그인·블로그 자동 확인 중…'
          : requiresReauthentication
            ? '연결 다시 확인'
            : isSetup && connectedBlogId
              ? '연결 확인 완료'
              : !isSetup && needsNewWriter
                ? '새 글쓰기 화면 열기'
                : !browserOpen
          ? '전용 Chrome 열기'
          : status?.stage === 'WRITER_LINK_READY'
            ? '연결 확인 후 글쓰기 화면 열기'
            : status?.stage === 'WRITER_READY'
              ? '진입 확인 완료'
              : '연결 다시 확인';

  const statusLabel = error
    ? '확인 필요'
    : status?.stage === 'WRITER_READY'
      ? '진입 확인 완료'
      : status?.stage === 'WRITER_LINK_READY'
        ? '블로그 확인 완료'
        : status?.stage === 'BLOG_MISMATCH'
          ? '블로그 불일치'
          : status?.stage === 'LOGIN_REQUIRED'
            ? '로그인 필요'
            : status?.stage === 'HOME_READY'
              ? '확인 가능'
              : '시작 전';

  const draftParagraphs = parseDraftParagraphs(draftBody);
  const draftBodyLength = draftParagraphs.join('\n\n').length;
  const dividerError = error
    ? [
        'INVALID_DIVIDER_REQUEST',
        'DIVIDER_OPERATION_INTERRUPTED',
        'DIVIDER_ANCHOR_NOT_FOUND',
        'DIVIDER_ANCHOR_MISMATCH',
        'DIVIDER_SELECTION_FAILED',
        'DIVIDER_CONTROL_NOT_FOUND',
        'DIVIDER_CONTROL_AMBIGUOUS',
        'DIVIDER_STYLE_CONTROL_NOT_FOUND',
        'DIVIDER_STYLE_CONTROL_AMBIGUOUS',
        'DIVIDER_STYLE_NOT_FOUND',
        'DIVIDER_STYLE_AMBIGUOUS',
        'DIVIDER_STYLE_STALE',
        'DIVIDER_STYLE_MISMATCH',
        'DIVIDER_INSERT_UNCONFIRMED',
        'DIVIDER_POSITION_MISMATCH',
      ].includes(error.code)
    : false;
  const dividerRetryBlocked = decorationStarted.current.divider || [
    'DIVIDER_INSERT_UNCONFIRMED',
    'DIVIDER_STYLE_MISMATCH',
    'DIVIDER_POSITION_MISMATCH',
  ].includes(error?.code ?? '');
  const quoteError = error
    ? [
        'INVALID_QUOTE_REQUEST',
        'QUOTE_OPERATION_INTERRUPTED',
        'QUOTE_ANCHOR_NOT_FOUND',
        'QUOTE_ANCHOR_MISMATCH',
        'QUOTE_SELECTION_FAILED',
        'QUOTE_CONTROL_NOT_FOUND',
        'QUOTE_CONTROL_AMBIGUOUS',
        'QUOTE_STYLE_CONTROL_NOT_FOUND',
        'QUOTE_STYLE_CONTROL_AMBIGUOUS',
        'QUOTE_STYLE_NOT_FOUND',
        'QUOTE_STYLE_AMBIGUOUS',
        'QUOTE_STYLE_STALE',
        'QUOTE_STYLE_MISMATCH',
        'QUOTE_INSERT_UNCONFIRMED',
        'QUOTE_POSITION_MISMATCH',
      ].includes(error.code)
    : false;
  const quoteRetryBlocked = decorationStarted.current.quote || [
    'QUOTE_INSERT_UNCONFIRMED',
    'QUOTE_STYLE_MISMATCH',
    'QUOTE_POSITION_MISMATCH',
  ].includes(error?.code ?? '');
  const stickerError = error
    ? [
        'INVALID_STICKER_REQUEST',
        'STICKER_OPERATION_INTERRUPTED',
        'STICKER_ANCHOR_NOT_FOUND',
        'STICKER_ANCHOR_MISMATCH',
        'STICKER_SELECTION_FAILED',
        'STICKER_CONTROL_NOT_FOUND',
        'STICKER_CONTROL_AMBIGUOUS',
        'STICKER_CATEGORY_NOT_FOUND',
        'STICKER_CATEGORY_AMBIGUOUS',
        'STICKER_CATEGORY_STALE',
        'STICKER_ITEM_NOT_FOUND',
        'STICKER_INSERT_UNCONFIRMED',
        'STICKER_POSITION_MISMATCH',
      ].includes(error.code)
    : false;
  const stickerRetryBlocked = decorationStarted.current.sticker || [
    'STICKER_INSERT_UNCONFIRMED',
    'STICKER_POSITION_MISMATCH',
  ].includes(error?.code ?? '');
  const imageError = error
    ? [
        'INVALID_IMAGE_SELECTION',
        'IMAGE_INPUT_NOT_FOUND',
        'IMAGE_INPUT_AMBIGUOUS',
        'IMAGE_UPLOAD_INTERRUPTED',
        'IMAGE_UPLOAD_FAILED',
        'IMAGE_PARTIAL_UPLOAD',
        'IMAGE_COUNT_MISMATCH',
        'IMAGE_LAYOUT_CONTROL_NOT_FOUND',
        'IMAGE_LAYOUT_CONTROL_AMBIGUOUS',
        'IMAGE_LAYOUT_MISMATCH',
        'CONTENT_INPUT_REQUIRED',
      ].includes(error.code)
    : false;
  const imageRetryBlocked = [
    'IMAGE_PARTIAL_UPLOAD',
    'IMAGE_LAYOUT_CONTROL_NOT_FOUND',
    'IMAGE_LAYOUT_CONTROL_AMBIGUOUS',
    'IMAGE_LAYOUT_MISMATCH',
  ].includes(error?.code ?? '');
  const imageLayoutNeedsMoreImages =
    imageLayout !== 'individual' &&
    selectedImages.length > 0 &&
    selectedImages.length < 2;
  const selectedImageLayoutLabel = getImageLayoutLabel(imageLayout);
  const draftSaveError = error
    ? [
        'DRAFT_SAVE_OPERATION_INTERRUPTED',
        'DRAFT_SAVE_CONTROL_NOT_FOUND',
        'DRAFT_SAVE_CONTROL_AMBIGUOUS',
        'DRAFT_SAVE_CLICK_FAILED',
        'DRAFT_SAVE_UNCONFIRMED',
        'DRAFT_SAVE_NAVIGATION_UNEXPECTED',
      ].includes(error.code) ||
      (
        Boolean(inputResult) &&
        [
          'CONTENT_INPUT_REQUIRED',
          'EDITOR_NOT_READY',
          'EDITOR_FIELD_AMBIGUOUS',
          'EDITOR_INPUT_MISMATCH',
        ].includes(error.code)
      )
    : false;
  const draftSaveRetryBlocked = [
    'DRAFT_SAVE_CLICK_FAILED',
    'DRAFT_SAVE_UNCONFIRMED',
    'DRAFT_SAVE_NAVIGATION_UNEXPECTED',
  ].includes(error?.code ?? '');
  const editorError = error
    ? [
        'INVALID_DRAFT_CONTENT',
        'EDITOR_NOT_READY',
        'EDITOR_FIELD_AMBIGUOUS',
        'EDITOR_NOT_BLANK',
        'EDITOR_INPUT_INTERRUPTED',
        'EDITOR_INPUT_MISMATCH',
      ].includes(error.code)
    : false;

  return (
    <div className="naver-compose-page">
      <header className="page-head">
        <div>
          {isSetup ? <h2 id="brand-naver-heading" tabIndex={-1}>네이버 연결</h2> : <h1>네이버 임시저장</h1>}
          <p>
            {isSetup ? '글을 작성하기 전에 저장할 블로그와 로그인 계정을 확인합니다.' : '연결을 다시 확인하고 글을 옮긴 뒤 임시저장하세요. 최종 발행은 네이버에서 직접 해주세요.'}
          </p>
        </div>
        {browserOpen || isActivelyRunning ? (
          <div className="page-head-actions">
            {browserOpen ? (
              <button
                className="button secondary"
                type="button"
                disabled={isActivelyRunning}
                onClick={() => void focusChrome()}
              >
                <ExternalLink aria-hidden="true" />
                Chrome 보기
              </button>
            ) : null}
            <button
              className="button danger"
              type="button"
              disabled={isStopping}
              onClick={() => void stopWork()}
            >
              {isStopping ? (
                <LoaderCircle className="is-spinning" aria-hidden="true" />
              ) : (
                <X aria-hidden="true" />
              )}
              {isStopping ? '중단 중…' : '작업 중단'}
            </button>
          </div>
        ) : null}
      </header>

      {!isSetup ? (
        <>
          <WritingSteps current={4} />
          <button className="button secondary workflow-back" type="button" disabled={isActivelyRunning} onClick={onBack}>글 확인으로 돌아가기</button>
        </>
      ) : null}

      {!isSetup && initialDraft ? (
        <section className="message success-message" role="status">
          <CheckCircle2 aria-hidden="true" />
          <div>
            <h2>작성한 글을 가져왔어요</h2>
            <p>작성한 제목·본문·이미지를 준비했습니다. 아래에서 글쓰기 화면을 확인한 뒤 옮겨 주세요. 이 화면으로 이동하는 것만으로 입력하거나 저장하지 않습니다.</p>
          </div>
        </section>
      ) : null}

      {!isSetup && decorationPlan ? (
        <section className="decoration-plan-summary" aria-label="미리 선택한 꾸미기">
          <h2>미리 선택한 꾸미기</h2>
          <p>{[
            decorationPlan.quote.enabled ? `인용구: ${decorationPlacementLabel(placements.quote)}` : null,
            decorationPlan.sticker.enabled ? `스티커: ${decorationPlacementLabel(placements.sticker)}` : null,
            decorationPlan.divider.enabled ? `구분선: ${decorationPlacementLabel(placements.divider)}` : null,
          ].filter(Boolean).join(' · ') || '사용 안 함'}</p>
          <p className="field-help">본문을 옮긴 뒤 선택한 항목이 아래에 표시됩니다. 실제 디자인 목록을 확인하고 삽입해 주세요.</p>
        </section>
      ) : null}
      <section className="status-strip" aria-label="네이버 연결 상태">
        <div className="status-item">
          <PanelsTopLeft aria-hidden="true" />
          <span>
            <strong>전용 Chrome</strong>
            <small>{browserOpen ? '열림' : '닫힘'}</small>
          </span>
        </div>
        <div className="status-item">
          <LogIn aria-hidden="true" />
          <span>
            <strong>연결 상태</strong>
            <small>{statusLabel}</small>
          </span>
        </div>
        <div className="status-item">
          <Link2 aria-hidden="true" />
          <span>
            <strong>현재 화면</strong>
            <small>{safeHostLabel(status?.currentUrl)}</small>
          </span>
        </div>
      </section>

      {(isStopping || stopNotice) && !error ? (
        <section className="message success-message" role="status">
          {isStopping ? (
            <LoaderCircle className="is-spinning" aria-hidden="true" />
          ) : (
            <CheckCircle2 aria-hidden="true" />
          )}
          <div>
            <h2>
              {isStopping ? '작업을 중단하는 중…' : '작업을 중단했습니다'}
            </h2>
            <p>
              {isStopping
                ? '진행 중인 자동화를 멈추고 전용 Chrome을 닫고 있습니다.'
                : '전용 Chrome을 닫고 현재 작업 상태를 초기화했습니다. 저장되지 않은 작업은 복구하지 않습니다.'}
            </p>
          </div>
        </section>
      ) : null}

      {error ? (
        <section className="message error-message" role="alert">
          <XCircle aria-hidden="true" />
          <div>
            <h2>
              {isInteractionPaused
                ? '자동 입력을 안전하게 멈췄습니다'
                : requiresReauthentication
                  ? '네이버 인증이 필요합니다'
                  : error.code === 'NAVER_NETWORK_ERROR'
                    ? '인터넷 연결을 확인해 주세요'
                    : draftSaveError
                ? '임시저장 상태를 확인해 주세요'
                : quoteError
                ? '인용구 상태를 확인해 주세요'
                : stickerError
                  ? '스티커 상태를 확인해 주세요'
                  : dividerError
                  ? '구분선 상태를 확인해 주세요'
                  : imageError
                  ? '이미지 상태를 확인해 주세요'
                  : editorError
                  ? '입력 상태를 확인해 주세요'
                  : '연결 상태를 확인해 주세요'}
            </h2>
            <p>{error.message}</p>
          </div>
        </section>
      ) : null}

      {structureTestResult ? (
        <section className="message success-message" role="status">
          <CheckCircle2 aria-hidden="true" />
          <div>
            <h2>화면 구조 변경 안전 중단을 확인했습니다</h2>
            <p>
              누락되거나 중복된 화면 요소를 추측해서 조작하지 않았습니다.
            </p>
          </div>
        </section>
      ) : networkTestResult ? (
        <section className="message success-message" role="status">
          <CheckCircle2 aria-hidden="true" />
          <div>
            <h2>네트워크 끊김 감지를 확인했습니다</h2>
            <p>
              전용 Chrome의 오프라인 상태를 감지했고 테스트 직후 연결 상태를 복구했습니다.
            </p>
          </div>
        </section>
      ) : interactionResult?.detected ? (
        <section className="message success-message" role="status">
          <CheckCircle2 aria-hidden="true" />
          <div>
            <h2>사용자 Chrome 조작을 감지했습니다</h2>
            <p>
              {getUserInteractionLabel(interactionResult.interactionType)} 신호만 확인했습니다. 입력 내용과 클릭 위치는 수집하지 않았습니다.
            </p>
          </div>
        </section>
      ) : draftSaveResult ? (
        <section className="message success-message" role="status">
          <CheckCircle2 aria-hidden="true" />
          <div>
            <h2>네이버 임시저장을 실행했습니다</h2>
            <p>
              저장 버튼을 한 번 조작했습니다. 최종 발행은 실행하지 않았습니다.
            </p>
          </div>
        </section>
      ) : quoteResult ? (
        <section className="message success-message" role="status">
          <CheckCircle2 aria-hidden="true" />
          <div>
            <h2>인용구 위치를 확인했습니다</h2>
            <p>
              {decorationPlacementLabel(placements.quote)} 설정으로 인용구 {decorationProgress.quote}회 삽입을 확인했습니다.
              임시저장과 최종 발행은 실행하지 않았습니다.
            </p>
          </div>
        </section>
      ) : stickerResult ? (
        <section className="message success-message" role="status">
          <CheckCircle2 aria-hidden="true" />
          <div>
            <h2>스티커 위치를 확인했습니다</h2>
            <p>
              {decorationPlacementLabel(placements.sticker)} 설정으로 스티커 {decorationProgress.sticker}회 삽입을 확인했습니다. 임시저장과 최종 발행은 실행하지 않았습니다.
            </p>
          </div>
        </section>
      ) : dividerResult ? (
        <section className="message success-message" role="status">
          <CheckCircle2 aria-hidden="true" />
          <div>
            <h2>구분선 위치를 확인했습니다</h2>
            <p>
              {decorationPlacementLabel(placements.divider)} 설정으로 구분선 {decorationProgress.divider}회 삽입을 확인했습니다.
              임시저장과 최종 발행은 실행하지 않았습니다.
            </p>
          </div>
        </section>
      ) : imageResult ? (
        <section className="message success-message" role="status">
          <CheckCircle2 aria-hidden="true" />
          <div>
            <h2>{getImageLayoutLabel(imageResult.layout)} 첨부를 확인했습니다</h2>
            <p>
              선택한 {imageResult.insertedCount}장의 이미지가 네이버 편집기에 삽입됐습니다.
              임시저장과 최종 발행은 실행하지 않았습니다.
            </p>
          </div>
        </section>
      ) : inputResult ? (
        <section className="message success-message" role="status">
          <CheckCircle2 aria-hidden="true" />
          <div>
            <h2>제목과 본문 입력을 확인했습니다</h2>
            <p>
              아래에서 첨부할 이미지를 선택하거나 네이버 Chrome에서 내용을 검토해 주세요.
            </p>
          </div>
        </section>
      ) : status?.stage === 'WRITER_READY' ? (
        <section className="message success-message" role="status">
          <CheckCircle2 aria-hidden="true" />
          <div>
            <h2>글쓰기 화면 진입을 확인했습니다</h2>
            <p>
              아래 입력 문안을 확인한 뒤 제목과 본문 입력을 시작할 수 있습니다.
            </p>
          </div>
        </section>
      ) : null}

      {historySaveWarning ? (
        <section className="message history-warning-message" role="status">
          <CircleAlert aria-hidden="true" />
          <div>
            <h2>작업 내역만 기록하지 못했습니다</h2>
            <p>{historySaveWarning} 네이버 임시저장 결과에는 영향이 없습니다.</p>
          </div>
        </section>
      ) : null}

      {isSetup && connectedBlogId ? (
        <div className="message success-message" role="status">
          <CheckCircle2 aria-hidden="true" />
          <div>
            <h3>네이버 연결 확인 완료</h3>
            <p>연결된 블로그: {connectedBlogId}. 글을 작성하는 동안 전용 Chrome을 열어 두세요.</p>
            <button className="button primary setup-next-button" type="button" disabled={isActivelyRunning} onClick={onContinue}>연결됐어요, 새 글 작성</button>
          </div>
        </div>
      ) : null}

      <section
        className="connection-workbench"
        aria-busy={isUiBusy || isAutoChecking}
        aria-labelledby="connection-form-heading"
      >
        <div className="connection-form-panel">
          <header className="panel-heading">
            <div>
              {isSetup ? <h3 id="connection-form-heading">어느 블로그에 저장할까요?</h3> : <h2 id="connection-form-heading">어느 블로그에 저장할까요?</h2>}
              <p>본인이 관리하는 블로그 주소를 넣고, 열리는 Chrome에서 네이버에 로그인하세요.</p>
            </div>
            <span className="document-state">저장하지 않음</span>
          </header>

          <form
            className="connection-form"
            onSubmit={(event) => {
              event.preventDefault();
              submitConnection();
            }}
          >
            <div className="field-group">
              <label htmlFor="naver-blog-url">
                네이버 블로그 주소 <span>필수</span>
              </label>
              <input
                id="naver-blog-url"
                ref={blogUrlInputRef}
                name="naver-blog-url"
                type="text"
                inputMode="url"
                autoComplete="url"
                placeholder="https://blog.naver.com/blogid"
                value={blogUrl}
                disabled={browserOpen}
                aria-invalid={fieldError ? true : undefined}
                aria-describedby={
                  fieldError
                    ? 'naver-blog-url-help naver-blog-url-error'
                    : 'naver-blog-url-help'
                }
                onChange={(event) => {
                  setBlogUrl(event.target.value);

                  if (fieldError) {
                    setError(null);
                  }
                }}
              />
              <p id="naver-blog-url-help" className="field-help">
                게시물 주소를 붙여 넣어도 블로그 ID만 확인합니다. 로그인 정보는 수집하지 않습니다.
              </p>
              {fieldError ? (
                <p
                  id="naver-blog-url-error"
                  className="field-error"
                >
                  {fieldError}
                </p>
              ) : null}
            </div>

            {status?.actualBlogId ? (
              <dl className="connection-values">
                <div>
                  <dt>등록 블로그</dt>
                  <dd>{status.registeredBlogId}</dd>
                </div>
                <div>
                  <dt>로그인 블로그</dt>
                  <dd>{status.actualBlogId}</dd>
                </div>
              </dl>
            ) : null}

            <div className="connection-note">
              <ShieldCheck aria-hidden="true" />
              <p>
                로그인은 Chrome에서 직접 진행합니다. BLOW는 아이디와 비밀번호를 읽거나 저장하지 않습니다.
              </p>
            </div>

            <button
              className="button primary connection-primary"
              type="submit"
              disabled={
                isActivelyRunning ||
                isInteractionPaused ||
                isAutoChecking ||
                ((isSetup ? Boolean(connectedBlogId) : status?.stage === 'WRITER_READY' && !needsNewWriter) && !requiresReauthentication)
              }
            >
              {isActivelyRunning || isAutoChecking ? (
                <LoaderCircle className="is-spinning" aria-hidden="true" />
              ) : requiresReauthentication ? (
                <ExternalLink aria-hidden="true" />
              ) : status?.stage === 'WRITER_LINK_READY' ? (
                <MousePointerClick aria-hidden="true" />
              ) : status?.stage === 'WRITER_READY' ? (
                <Check aria-hidden="true" />
              ) : (
                <ExternalLink aria-hidden="true" />
              )}
              {actionLabel}
            </button>
          </form>
        </div>

        <aside
          className="connection-progress"
          aria-labelledby="connection-progress-heading"
        >
          <header className="panel-heading compact">
            <div>
              {isSetup ? <h3 id="connection-progress-heading">연결 순서</h3> : <h2 id="connection-progress-heading">연결 순서</h2>}
              <p>각 화면이 확실할 때만 다음 단계로 이동합니다.</p>
            </div>
          </header>

          <div
            className="live-status"
            role={error ? undefined : 'status'}
            aria-live={error ? undefined : 'polite'}
            aria-atomic="true"
          >
            {error ? (
              <XCircle aria-hidden="true" />
            ) : status?.stage === 'WRITER_READY' ? (
              <CheckCircle2 aria-hidden="true" />
            ) : isUiBusy || isAutoChecking ? (
              <LoaderCircle className="is-spinning" aria-hidden="true" />
            ) : (
              <Circle aria-hidden="true" />
            )}
            <span>
              <strong>{statusLabel}</strong>
              <small>
                {status?.message ??
                  '블로그 주소를 입력하고 전용 Chrome을 열어 주세요.'}
              </small>
            </span>
          </div>

          <ol className="step-list">
            {(isSetup ? connectionSteps.slice(0, 3) : connectionSteps).map((step, index) => {
              const stepStatus = getConnectionStepStatus(
                index,
                status,
                activeAction === 'open',
              );

              return (
                <li
                  className={`step-row is-${stepStatus}`}
                  key={step.label}
                  aria-current={
                    stepStatus === 'current' ? 'step' : undefined
                  }
                >
                  <span className="step-icon">
                    <StepIcon status={stepStatus} />
                  </span>
                  <span className="step-copy">
                    <strong>{step.label}</strong>
                    <small>{step.description}</small>
                  </span>
                  <span className="step-state">
                    {stepStatus === 'complete'
                      ? '완료'
                      : stepStatus === 'current'
                        ? '현재'
                        : stepStatus === 'failed'
                          ? '확인 필요'
                          : '대기'}
                  </span>
                </li>
              );
            })}
          </ol>
        </aside>
      </section>

      <div className="naver-transfer-panels" hidden={isSetup || !initialDraft || loadedDraftRef.current !== initialDraft}>
      {showDiagnostics && status?.stage === 'WRITER_READY' ? (
        <section
          className="divider-test-panel"
          aria-labelledby="network-test-heading"
          aria-busy={activeAction === 'network-test'}
        >
          <header className="panel-heading">
            <div>
              <h2 id="network-test-heading">네트워크 끊김 감지 테스트</h2>
              <p>
                PC의 인터넷은 유지하고 전용 Chrome만 잠시 오프라인으로 전환해 안전 중단을 확인합니다.
              </p>
            </div>
            <span className="document-state">
              {networkTestResult
                ? '차단·복구 확인 완료'
                : activeAction === 'network-test'
                  ? '확인 중'
                  : '테스트 전'}
            </span>
          </header>

          <div className="divider-test-layout">
            <div className="divider-test-form">
              <div className="editor-input-note">
                <ShieldCheck aria-hidden="true" />
                <p>
                  게시물 내용과 로그인 정보는 건드리지 않습니다. 테스트가 끝나면 전용 Chrome의 네트워크를 즉시 복구합니다.
                </p>
              </div>

              {networkTestError ? (
                <div className="editor-inline-error">
                  <XCircle aria-hidden="true" />
                  <div>
                    <strong>네트워크 끊김 감지를 확인하지 못했습니다</strong>
                    <p>{networkTestError}</p>
                  </div>
                </div>
              ) : null}

              <button
                className="button primary divider-insert-button"
                type="button"
                disabled={isUiBusy || Boolean(networkTestResult)}
                onClick={() => void testNetworkInterruption()}
              >
                {activeAction === 'network-test' ? (
                  <LoaderCircle className="is-spinning" aria-hidden="true" />
                ) : networkTestResult ? (
                  <Check aria-hidden="true" />
                ) : (
                  <WifiOff aria-hidden="true" />
                )}
                {activeAction === 'network-test'
                  ? '네트워크 차단·복구 확인 중…'
                  : networkTestResult
                    ? '네트워크 감지 완료'
                    : '네트워크 감지 시작'}
              </button>
            </div>

            <aside
              className="divider-test-summary"
              aria-label="네트워크 끊김 감지 범위"
            >
              <WifiOff aria-hidden="true" />
              <div>
                <h3>
                  {networkTestResult ? '처리 결과' : '이번 단계에서 확인할 내용'}
                </h3>
                {networkTestResult ? (
                  <dl className="editor-result-values">
                    <div>
                      <dt>오프라인 감지</dt>
                      <dd>완료</dd>
                    </div>
                    <div>
                      <dt>네트워크 복구</dt>
                      <dd>완료</dd>
                    </div>
                    <div>
                      <dt>게시물 조작</dt>
                      <dd>없음</dd>
                    </div>
                  </dl>
                ) : (
                  <ol>
                    <li>전용 Chrome만 일시적으로 네트워크 차단</li>
                    <li>오프라인 상태에서 자동 입력 시작 차단 확인</li>
                    <li>검증 직후 전용 Chrome 네트워크 복구</li>
                    <li>게시물과 로그인 정보는 변경하지 않음</li>
                  </ol>
                )}
              </div>
            </aside>
          </div>
        </section>
      ) : null}

      {showDiagnostics && status?.stage === 'WRITER_READY' ? (
        <section
          className="divider-test-panel"
          aria-labelledby="structure-test-heading"
          aria-busy={activeAction === 'structure-test'}
        >
          <header className="panel-heading">
            <div>
              <h2 id="structure-test-heading">화면 구조 변경 안전 중단 테스트</h2>
              <p>
                네이버 화면의 요소가 사라지거나 중복돼도 임의로 조작하지 않는지 확인합니다.
              </p>
            </div>
            <span className="document-state">
              {structureTestResult
                ? '안전 중단 확인 완료'
                : activeAction === 'structure-test'
                  ? '확인 중'
                  : '테스트 전'}
            </span>
          </header>

          <div className="divider-test-layout">
            <div className="divider-test-form">
              <div className="editor-input-note">
                <ShieldCheck aria-hidden="true" />
                <p>
                  실제 화면을 바꾸지 않고 읽기 방식으로만 검사합니다. 게시물 클릭과 입력은 실행하지 않습니다.
                </p>
              </div>

              {structureTestError ? (
                <div className="editor-inline-error">
                  <XCircle aria-hidden="true" />
                  <div>
                    <strong>화면 구조 변경 안전 중단을 확인하지 못했습니다</strong>
                    <p>{structureTestError}</p>
                  </div>
                </div>
              ) : null}

              <button
                className="button primary divider-insert-button"
                type="button"
                disabled={isUiBusy || Boolean(structureTestResult)}
                onClick={() => void testStructureChange()}
              >
                {activeAction === 'structure-test' ? (
                  <LoaderCircle className="is-spinning" aria-hidden="true" />
                ) : structureTestResult ? (
                  <Check aria-hidden="true" />
                ) : (
                  <PanelsTopLeft aria-hidden="true" />
                )}
                {activeAction === 'structure-test'
                  ? '구조 변경 안전 중단 확인 중…'
                  : structureTestResult
                    ? '구조 변경 감지 완료'
                    : '구조 변경 감지 시작'}
              </button>
            </div>

            <aside
              className="divider-test-summary"
              aria-label="화면 구조 변경 안전 중단 범위"
            >
              <PanelsTopLeft aria-hidden="true" />
              <div>
                <h3>
                  {structureTestResult ? '처리 결과' : '이번 단계에서 확인할 내용'}
                </h3>
                {structureTestResult ? (
                  <dl className="editor-result-values">
                    <div>
                      <dt>누락 요소 차단</dt>
                      <dd>완료</dd>
                    </div>
                    <div>
                      <dt>중복 요소 차단</dt>
                      <dd>완료</dd>
                    </div>
                    <div>
                      <dt>자동 클릭·입력</dt>
                      <dd>{structureTestResult.automatedActionCount}회</dd>
                    </div>
                  </dl>
                ) : (
                  <ol>
                    <li>검증용 누락 요소를 찾지 못하면 즉시 중단</li>
                    <li>검증용 요소가 둘 이상이면 임의 선택 없이 중단</li>
                    <li>버튼 클릭과 편집기 입력이 0회인지 확인</li>
                    <li>현재 게시물과 로그인 상태는 변경하지 않음</li>
                  </ol>
                )}
              </div>
            </aside>
          </div>
        </section>
      ) : null}

      {showDiagnostics && status?.stage === 'WRITER_READY' ? (
        <section
          className="divider-test-panel"
          aria-labelledby="force-exit-test-heading"
          aria-busy={activeAction === 'force-exit-test'}
        >
          <header className="panel-heading">
            <div>
              <h2 id="force-exit-test-heading">앱 강제 종료·초기화 테스트</h2>
              <p>
                BLOW를 즉시 종료한 뒤 다음 실행에서 이전 작업을 복구하지 않는지 확인합니다.
              </p>
            </div>
            <span className="document-state">
              {activeAction === 'force-exit-test' ? '종료 중' : '테스트 전'}
            </span>
          </header>

          <div className="divider-test-layout">
            <div className="divider-test-form">
              <div className="editor-input-note">
                <ShieldCheck aria-hidden="true" />
                <p>
                  확인창에서 테스트 종료를 선택한 경우에만 BLOW가 닫힙니다. 네이버 편집기에 남은 내용은 자동으로 삭제하지 않습니다.
                </p>
              </div>

              <button
                className="button danger divider-insert-button"
                type="button"
                disabled={isUiBusy}
                onClick={() => void forceExitTest()}
              >
                {activeAction === 'force-exit-test' ? (
                  <LoaderCircle className="is-spinning" aria-hidden="true" />
                ) : (
                  <X aria-hidden="true" />
                )}
                {activeAction === 'force-exit-test'
                  ? 'BLOW 종료 중…'
                  : '강제 종료 테스트'}
              </button>
            </div>

            <aside
              className="divider-test-summary"
              aria-label="앱 강제 종료 후 초기화 확인 순서"
            >
              <X aria-hidden="true" />
              <div>
                <h3>이번 단계에서 확인할 내용</h3>
                <ol>
                  <li>확인창에서 테스트 종료 선택</li>
                  <li>BLOW가 즉시 닫히는지 확인</li>
                  <li>BLOW를 다시 실행</li>
                  <li>블로그 주소와 진행 단계가 초기화됐는지 확인</li>
                </ol>
              </div>
            </aside>
          </div>
        </section>
      ) : null}

      {showDiagnostics && status?.stage === 'WRITER_READY' ? (
        <section
          className="divider-test-panel"
          aria-labelledby="compatibility-environment-heading"
          aria-busy={activeAction === 'environment-inspection'}
        >
          <header className="panel-heading">
            <div>
              <h2 id="compatibility-environment-heading">현재 호환성 환경 확인</h2>
              <p>
                현재 Windows·전용 Chrome·화면 배율을 확인해 반복 테스트의 기준을 기록합니다.
              </p>
            </div>
            <span className="document-state">
              {compatibilityEnvironment
                ? '환경 기록 완료'
                : activeAction === 'environment-inspection'
                  ? '확인 중'
                  : '확인 전'}
            </span>
          </header>

          <div className="divider-test-layout">
            <div className="divider-test-form">
              <div className="editor-input-note">
                <ShieldCheck aria-hidden="true" />
                <p>
                  버전과 화면 배율만 확인하며 로그인 정보와 게시물 내용은 읽지 않습니다. 표시된 값은 지원 확정이 아니라 이후 반복 검증에 사용할 현재 기준입니다.
                </p>
              </div>

              {compatibilityEnvironmentError ? (
                <div className="editor-inline-error">
                  <XCircle aria-hidden="true" />
                  <div>
                    <strong>현재 환경을 확인하지 못했습니다</strong>
                    <p>{compatibilityEnvironmentError}</p>
                  </div>
                </div>
              ) : null}

              <button
                className="button primary divider-insert-button"
                type="button"
                disabled={isUiBusy}
                onClick={() => void inspectCompatibilityEnvironment()}
              >
                {activeAction === 'environment-inspection' ? (
                  <LoaderCircle className="is-spinning" aria-hidden="true" />
                ) : (
                  <PanelsTopLeft aria-hidden="true" />
                )}
                {activeAction === 'environment-inspection'
                  ? '현재 환경 확인 중…'
                  : '현재 환경 확인'}
              </button>
            </div>

            <aside
              className="divider-test-summary"
              aria-label="현재 호환성 환경 확인 결과"
            >
              <PanelsTopLeft aria-hidden="true" />
              <div>
                <h3>
                  {compatibilityEnvironment ? '확인 결과' : '이번 단계에서 확인할 내용'}
                </h3>
                {compatibilityEnvironment ? (
                  <dl className="editor-result-values">
                    <div>
                      <dt>운영체제</dt>
                      <dd>{compatibilityEnvironment.operatingSystem}</dd>
                    </div>
                    <div>
                      <dt>전용 Chrome</dt>
                      <dd>{compatibilityEnvironment.chromeVersion}</dd>
                    </div>
                    <div>
                      <dt>화면 배율</dt>
                      <dd>{compatibilityEnvironment.displayScalePercent}%</dd>
                    </div>
                  </dl>
                ) : (
                  <ol>
                    <li>현재 Windows 버전 확인</li>
                    <li>실행 중인 전용 Chrome 버전 확인</li>
                    <li>BLOW 창이 표시된 화면의 배율 확인</li>
                    <li>다음 반복 테스트의 기준 환경으로 기록</li>
                  </ol>
                )}
              </div>
            </aside>
          </div>
        </section>
      ) : null}

      {showDiagnostics && status?.stage === 'WRITER_READY' ? (
        <section
          className="divider-test-panel"
          aria-labelledby="writer-navigation-repeat-heading"
          aria-busy={activeAction === 'writer-navigation-repeat'}
        >
          <header className="panel-heading">
            <div>
              <h2 id="writer-navigation-repeat-heading">글쓰기 진입 20회 반복 테스트</h2>
              <p>
                현재 Chrome에서 등록 블로그 확인과 글쓰기 화면 진입을 20회 연속 검증합니다.
              </p>
            </div>
            <span className="document-state" aria-live="polite">
              {writerNavigationResult
                ? '20회 완료'
                : activeAction === 'writer-navigation-repeat'
                  ? `${writerNavigationProgress.completedRuns}/20 진행 중`
                  : '테스트 전'}
            </span>
          </header>

          <div className="divider-test-layout">
            <div className="divider-test-form">
              <div className="editor-input-note">
                <ShieldCheck aria-hidden="true" />
                <p>
                  현재 편집기는 그대로 유지합니다. 회차마다 별도의 검증용 탭을 열고 진입 결과를 확인한 뒤 자동으로 닫습니다. 진행 중에는 Chrome을 직접 조작하지 마세요.
                </p>
              </div>

              {!compatibilityEnvironment ? (
                <div className="editor-inline-error">
                  <XCircle aria-hidden="true" />
                  <div>
                    <strong>현재 환경 확인이 필요합니다</strong>
                    <p>바로 위에서 현재 환경 확인을 먼저 완료해 주세요.</p>
                  </div>
                </div>
              ) : writerNavigationError ? (
                <div className="editor-inline-error">
                  <XCircle aria-hidden="true" />
                  <div>
                    <strong>연속 진입 테스트를 중단했습니다</strong>
                    <p>{writerNavigationError}</p>
                  </div>
                </div>
              ) : null}

              <button
                className="button primary divider-insert-button"
                type="button"
                disabled={isUiBusy || !compatibilityEnvironment}
                onClick={() => void testWriterNavigationRepeat()}
              >
                {activeAction === 'writer-navigation-repeat' ? (
                  <LoaderCircle className="is-spinning" aria-hidden="true" />
                ) : (
                  <PanelsTopLeft aria-hidden="true" />
                )}
                {activeAction === 'writer-navigation-repeat'
                  ? `${writerNavigationProgress.completedRuns}/20 확인 중…`
                  : writerNavigationResult
                    ? '20회 다시 테스트'
                    : '20회 연속 테스트 시작'}
              </button>
            </div>

            <aside
              className="divider-test-summary"
              aria-label="글쓰기 화면 반복 진입 결과"
            >
              <PanelsTopLeft aria-hidden="true" />
              <div>
                <h3>
                  {writerNavigationResult ||
                  activeAction === 'writer-navigation-repeat' ||
                  writerNavigationProgress.completedRuns > 0
                    ? '처리 결과'
                    : '이번 단계에서 확인할 내용'}
                </h3>
                {writerNavigationResult ||
                activeAction === 'writer-navigation-repeat' ||
                writerNavigationProgress.completedRuns > 0 ? (
                  <dl className="editor-result-values">
                    <div>
                      <dt>전용 Chrome</dt>
                      <dd>{compatibilityEnvironment?.chromeVersion ?? '확인 중'}</dd>
                    </div>
                    <div>
                      <dt>글쓰기 진입</dt>
                      <dd aria-live="polite">
                        {writerNavigationProgress.completedRuns}/{writerNavigationProgress.totalRuns}회
                      </dd>
                    </div>
                    <div>
                      <dt>검증용 탭</dt>
                      <dd>{writerNavigationResult ? '모두 정리됨' : '회차마다 자동 정리'}</dd>
                    </div>
                    <div>
                      <dt>최종 발행</dt>
                      <dd>조작 없음</dd>
                    </div>
                  </dl>
                ) : (
                  <ol>
                    <li>현재 환경 기록 완료</li>
                    <li>등록 블로그와 글쓰기 경로 20회 재확인</li>
                    <li>각 회차에서 글쓰기 화면 진입 확인</li>
                    <li>실패 시 해당 회차에서 즉시 중단</li>
                  </ol>
                )}
              </div>
            </aside>
          </div>
        </section>
      ) : null}
      {showDiagnostics && status?.stage === 'WRITER_READY' ? (
        <section
          className="divider-test-panel"
          aria-labelledby="slow-network-test-heading"
          aria-busy={activeAction === 'slow-network-test'}
        >
          <header className="panel-heading">
            <div>
              <h2 id="slow-network-test-heading">느린 네트워크 진입 테스트</h2>
              <p>
                검증용 탭의 페이지 이동마다 1.5초 지연을 적용해 블로그 홈과 글쓰기 진입을 검사합니다.
              </p>
            </div>
            <span className="document-state" aria-live="polite">
              {slowNetworkResult
                ? '저속 환경 확인 완료'
                : activeAction === 'slow-network-test'
                  ? '지연 적용 중'
                  : '테스트 전'}
            </span>
          </header>

          <div className="divider-test-layout">
            <div className="divider-test-form">
              <div className="editor-input-note">
                <ShieldCheck aria-hidden="true" />
                <p>
                  현재 편집기는 그대로 유지합니다. 별도의 검증용 탭에만 지연을 적용하며, 테스트가 끝나면 지연 설정과 탭을 자동으로 정리합니다.
                </p>
              </div>

              {slowNetworkError ? (
                <div className="editor-inline-error">
                  <XCircle aria-hidden="true" />
                  <div>
                    <strong>느린 네트워크 테스트를 완료하지 못했습니다</strong>
                    <p>{slowNetworkError}</p>
                  </div>
                </div>
              ) : null}

              <button
                className="button primary divider-insert-button"
                type="button"
                disabled={isUiBusy}
                onClick={() => void testSlowNetwork()}
              >
                {activeAction === 'slow-network-test' ? (
                  <LoaderCircle className="is-spinning" aria-hidden="true" />
                ) : slowNetworkResult ? (
                  <Check aria-hidden="true" />
                ) : (
                  <Gauge aria-hidden="true" />
                )}
                {activeAction === 'slow-network-test'
                  ? '느린 네트워크 확인 중…'
                  : slowNetworkResult
                    ? '느린 네트워크 확인 완료'
                    : '느린 네트워크 테스트 시작'}
              </button>
            </div>

            <aside
              className="divider-test-summary"
              aria-label="느린 네트워크 테스트 결과"
            >
              <Gauge aria-hidden="true" />
              <div>
                <h3>
                  {slowNetworkResult ? '처리 결과' : '이번 단계에서 확인할 내용'}
                </h3>
                {slowNetworkResult ? (
                  <dl className="editor-result-values">
                    <div>
                      <dt>페이지 이동 지연</dt>
                      <dd>{(slowNetworkResult.latencyMs / 1_000).toFixed(1)}초</dd>
                    </div>
                    <div>
                      <dt>지연된 페이지 이동</dt>
                      <dd>{slowNetworkResult.delayedNavigationCount}회</dd>
                    </div>
                    <div>
                      <dt>블로그 홈</dt>
                      <dd>{slowNetworkResult.blogHomeReached ? '완료' : '미확인'}</dd>
                    </div>
                    <div>
                      <dt>글쓰기 진입</dt>
                      <dd>{slowNetworkResult.writerReached ? '완료' : '미확인'}</dd>
                    </div>
                  </dl>
                ) : (
                  <ol>
                    <li>별도의 검증용 탭 열기</li>
                    <li>블로그와 글쓰기 페이지 이동에 1.5초 지연 적용</li>
                    <li>중복 클릭 없이 각 화면이 열릴 때까지 대기</li>
                    <li>입력·저장·발행 없이 검증용 탭 정리</li>
                  </ol>
                )}
              </div>
            </aside>
          </div>
        </section>
      ) : null}

      {showDiagnostics && status?.stage === 'WRITER_READY' ? (
        <section
          className="divider-test-panel"
          aria-labelledby="interaction-test-heading"
          aria-busy={activeAction === 'interaction-monitor'}
        >
          <header className="panel-heading">
            <div>
              <h2 id="interaction-test-heading">Chrome 조작 감지 테스트</h2>
              <p>
                10초 동안 전용 Chrome에서 발생하는 사용자 조작을 확인합니다.
              </p>
            </div>
            <span className="document-state">
              {interactionResult?.detected
                ? '감지 확인 완료'
                : activeAction === 'interaction-monitor'
                  ? '감지 중'
                  : '테스트 전'}
            </span>
          </header>

          <div className="divider-test-layout">
            <div className="divider-test-form">
              <div className="editor-input-note">
                <ShieldCheck aria-hidden="true" />
                <p>
                  시작하면 전용 Chrome이 앞으로 이동합니다. 글 입력 영역이 아닌 페이지 여백을 한 번 클릭해 주세요. 입력 내용은 읽거나 저장하지 않습니다.
                </p>
              </div>

              {interactionError ? (
                <div className="editor-inline-error">
                  <XCircle aria-hidden="true" />
                  <div>
                    <strong>사용자 조작 감지를 시작하지 못했습니다</strong>
                    <p>{interactionError}</p>
                  </div>
                </div>
              ) : interactionResult && !interactionResult.detected ? (
                <div className="editor-inline-error">
                  <XCircle aria-hidden="true" />
                  <div>
                    <strong>10초 동안 조작을 감지하지 못했습니다</strong>
                    <p>다시 시작한 뒤 전용 Chrome에서 클릭이나 키보드 입력을 해 주세요.</p>
                  </div>
                </div>
              ) : null}

              <button
                className="button primary divider-insert-button"
                type="button"
                disabled={isUiBusy || Boolean(interactionResult?.detected)}
                onClick={() => void monitorUserInteraction()}
              >
                {activeAction === 'interaction-monitor' ? (
                  <LoaderCircle className="is-spinning" aria-hidden="true" />
                ) : interactionResult?.detected ? (
                  <Check aria-hidden="true" />
                ) : (
                  <MousePointerClick aria-hidden="true" />
                )}
                {activeAction === 'interaction-monitor'
                  ? '사용자 조작 감지 중…'
                  : interactionResult?.detected
                    ? '사용자 조작 감지 완료'
                    : interactionResult
                      ? '10초 감지 다시 시작'
                      : '10초 감지 시작'}
              </button>
            </div>

            <aside
              className="divider-test-summary"
              aria-label="사용자 Chrome 조작 감지 범위"
            >
              <MousePointerClick aria-hidden="true" />
              <div>
                <h3>{interactionResult ? '처리 결과' : '이번 단계에서 확인할 내용'}</h3>
                {interactionResult ? (
                  <dl className="editor-result-values">
                    <div>
                      <dt>감지 결과</dt>
                      <dd>{interactionResult.detected ? '감지 완료' : '감지 없음'}</dd>
                    </div>
                    <div>
                      <dt>조작 유형</dt>
                      <dd>{getUserInteractionLabel(interactionResult.interactionType)}</dd>
                    </div>
                    <div>
                      <dt>대기 시간</dt>
                      <dd>{Math.max(1, Math.ceil(interactionResult.waitedMs / 1_000))}초</dd>
                    </div>
                    <div>
                      <dt>수집 내용</dt>
                      <dd>조작 유형만 확인</dd>
                    </div>
                  </dl>
                ) : (
                  <ol>
                    <li>감지 시작과 동시에 전용 Chrome으로 이동</li>
                    <li>글 입력 영역이 아닌 페이지 여백을 한 번 클릭</li>
                    <li>입력한 글자나 클릭 위치는 수집하지 않음</li>
                    <li>조작 감지 후 BLOW 화면으로 자동 복귀</li>
                  </ol>
                )}
              </div>
            </aside>
          </div>
        </section>
      ) : null}
      {status?.stage === 'WRITER_READY' && !needsNewWriter ? (
        <section
          className="editor-test-panel"
          aria-labelledby="editor-test-heading"
          aria-busy={activeAction === 'input'}
        >
          <header className="panel-heading">
            <div>
              <h2 id="editor-test-heading">제목과 본문 입력</h2>
              <p>
                입력할 문안을 먼저 확인한 뒤 빈 네이버 글쓰기 화면에 입력합니다.
              </p>
            </div>
            <span className="document-state">
              {inputResult ? '입력 확인 완료' : '저장하지 않음'}
            </span>
          </header>

          <div className="editor-test-layout">
            <form
              className="editor-test-form"
              onSubmit={(event) => {
                event.preventDefault();
                void runEditorInput();
              }}
            >
              <div className="field-group">
                <label htmlFor="editor-test-title">
                  제목 <span>필수</span>
                </label>
                <input
                  id="editor-test-title"
                  ref={draftTitleInputRef}
                  type="text"
                  maxLength={100}
                  value={draftTitle}
                  disabled={Boolean(inputResult)}
                  aria-invalid={draftErrors.title ? true : undefined}
                  aria-describedby={
                    draftErrors.title
                      ? 'editor-test-title-help editor-test-title-error'
                      : 'editor-test-title-help'
                  }
                  onChange={(event) => {
                    setDraftTitle(event.target.value);

                    if (draftErrors.title) {
                      setDraftErrors((current) => ({
                        ...current,
                        title: '',
                      }));
                    }
                  }}
                />
                <p id="editor-test-title-help" className="field-help">
                  {draftTitle.trim().length}/100자
                </p>
                {draftErrors.title ? (
                  <p id="editor-test-title-error" className="field-error">
                    {draftErrors.title}
                  </p>
                ) : null}
              </div>

              <div className="field-group">
                <label htmlFor="editor-test-body">
                  본문 <span>필수</span>
                </label>
                <textarea
                  id="editor-test-body"
                  ref={draftBodyInputRef}
                  rows={8}
                  maxLength={10_000}
                  value={draftBody}
                  disabled={Boolean(inputResult)}
                  aria-invalid={draftErrors.body ? true : undefined}
                  aria-describedby={
                    draftErrors.body
                      ? 'editor-test-body-help editor-test-body-error'
                      : 'editor-test-body-help'
                  }
                  onChange={(event) => {
                    setDraftBody(event.target.value);

                    if (draftErrors.body) {
                      setDraftErrors((current) => ({
                        ...current,
                        body: '',
                      }));
                    }
                  }}
                />
                <p id="editor-test-body-help" className="field-help">
                  줄을 나눈 문장을 각각 한 문단으로 입력합니다. 현재 {draftParagraphs.length}개 문단,
                  {' '}{draftBodyLength.toLocaleString('ko-KR')}자입니다.
                </p>
                {draftErrors.body ? (
                  <p id="editor-test-body-error" className="field-error">
                    {draftErrors.body}
                  </p>
                ) : null}
              </div>

              <div className="editor-input-note">
                <ShieldCheck aria-hidden="true" />
                <p>
                  입력 버튼을 누르면 2초 동안 안전 감시를 준비합니다. 자동 입력이 끝나기 전에 BLOW 화면을 벗어나면 작업을 멈춥니다. 입력값은 디스크에 저장하지 않지만, 네이버 편집기가 자동 복구용 내용을 남길 수 있습니다.
                </p>
              </div>

              {editorError && error ? (
                <div className="editor-inline-error">
                  <XCircle aria-hidden="true" />
                  <div>
                    <strong>입력을 시작하지 못했습니다</strong>
                    <p>{error.message}</p>
                  </div>
                </div>
              ) : null}

              <button
                className="button primary editor-input-button"
                type="submit"
                disabled={isUiBusy || Boolean(inputResult)}
              >
                {activeAction === 'input' ? (
                  <LoaderCircle className="is-spinning" aria-hidden="true" />
                ) : inputResult ? (
                  <Check aria-hidden="true" />
                ) : (
                  <Keyboard aria-hidden="true" />
                )}
                {activeAction === 'input'
                  ? '입력·검증 중…'
                  : inputResult
                    ? '입력 확인 완료'
                    : '제목·본문 입력'}
              </button>
            </form>

            <aside className="editor-test-summary" aria-label="입력 범위">
              <FileText aria-hidden="true" />
              <div>
                <h3>{inputResult ? '처리 결과' : '이번 단계에서 확인할 내용'}</h3>
                {inputResult ? (
                  <dl className="editor-result-values">
                    <div>
                      <dt>제목</dt>
                      <dd>{inputResult.titleLength}자</dd>
                    </div>
                    <div>
                      <dt>본문</dt>
                      <dd>{inputResult.bodyLength.toLocaleString('ko-KR')}자</dd>
                    </div>
                    <div>
                      <dt>문단</dt>
                      <dd>{inputResult.paragraphCount}개</dd>
                    </div>
                  </dl>
                ) : (
                  <ol>
                    <li>제목과 본문 입력 영역이 각각 한 개인지 확인</li>
                    <li>기존 내용이 없는 빈 새 글인지 확인</li>
                    <li>제목과 문단을 순서대로 입력</li>
                    <li>입력 결과를 원문과 다시 비교</li>
                  </ol>
                )}
              </div>
            </aside>
          </div>
        </section>
      ) : null}

      {inputResult ? (
        <section
          className="image-test-panel optional-editor-panel"
          aria-labelledby="image-test-heading"
          aria-busy={activeAction === 'select-images' || activeAction === 'images'}
        >
          <header className="panel-heading">
            <div>
              <h2 id="image-test-heading">사진 배치</h2>
              <p>
                {initialDraft?.images.length
                  ? '생성 이미지를 확인하고 배치 방식을 선택해 네이버 편집기에 첨부합니다.'
                  : '로컬 JPG 또는 PNG 파일과 배치 방식을 선택해 네이버 편집기에 첨부합니다.'}
              </p>
            </div>
            <span className="document-state">
              {imageResult ? '첨부 확인 완료' : '저장하지 않음'}
            </span>
          </header>

          <div className="image-test-layout">
            <div className="image-test-form">
              <div className="field-group">
                <span className="field-label">
                  첨부 이미지 <span>필수</span>
                </span>
                <div className="image-select-row">
                  <button
                    className="button secondary"
                    type="button"
                    disabled={
                      isUiBusy || Boolean(imageResult) || imageRetryBlocked
                    }
                    onClick={() => void selectImages()}
                  >
                    {activeAction === 'select-images' ? (
                      <LoaderCircle className="is-spinning" aria-hidden="true" />
                    ) : (
                      <ImagePlus aria-hidden="true" />
                    )}
                    {activeAction === 'select-images'
                      ? '선택 창 여는 중…'
                      : selectedImages.length > 0
                        ? '이미지 다시 선택'
                        : '이미지 선택'}
                  </button>
                  <span className="image-selection-count" aria-live="polite">
                    {selectedImages.length > 0
                      ? `${selectedImages.length}장 선택됨`
                      : '선택된 이미지 없음'}
                  </span>
                </div>
                <p className="field-help">
                  {initialDraft?.images.length
                    ? '생성 이미지는 BLOW 전용 로컬 폴더에 JPG로 준비하며 서버로 보내지 않습니다. 필요하면 다른 이미지를 다시 선택할 수 있습니다.'
                    : '파일 경로는 화면에 표시하거나 서버로 보내지 않습니다. 이번 단계에서는 JPG와 PNG만 지원합니다.'}
                </p>

                {selectedImages.length > 0 ? (
                  <div className="selected-image-files">
                    <ul aria-label="선택한 이미지 목록">
                      {selectedImages.slice(0, 6).map((image) => (
                        <li key={image.id}>
                          <Images aria-hidden="true" />
                          <span>{image.name}</span>
                          <small>{formatFileSize(image.sizeBytes)}</small>
                        </li>
                      ))}
                    </ul>
                    {selectedImages.length > 6 ? (
                      <p>이외 {selectedImages.length - 6}장이 함께 첨부됩니다.</p>
                    ) : null}
                  </div>
                ) : null}
              </div>

              <fieldset
                className="image-layout-fieldset"
                disabled={isUiBusy || Boolean(imageResult) || imageRetryBlocked}
                aria-describedby="image-layout-help"
              >
                <legend className="field-label">
                  사진 배치 방식 <span>필수</span>
                </legend>
                <div className="image-layout-options">
                  {imageLayoutOptions.map((option) => (
                    <label
                      className={`image-layout-option${
                        imageLayout === option.value ? ' is-selected' : ''
                      }`}
                      key={option.value}
                    >
                      <input
                        type="radio"
                        name="image-layout"
                        value={option.value}
                        checked={imageLayout === option.value}
                        onChange={() => {
                          setImageLayout(option.value);
                          setError(null);
                        }}
                      />
                      <span>
                        <strong>{option.label}</strong>
                        <small>{option.description}</small>
                      </span>
                      {imageLayout === option.value ? (
                        <Check aria-hidden="true" />
                      ) : null}
                    </label>
                  ))}
                </div>
                <p
                  id="image-layout-help"
                  className={`layout-selection-help${
                    imageLayoutNeedsMoreImages ? ' is-error' : ''
                  }`}
                  aria-live="polite"
                >
                  {imageLayoutNeedsMoreImages
                    ? `${selectedImageLayoutLabel}는 이미지를 2장 이상 선택해야 합니다.`
                    : imageLayout === 'individual'
                      ? '한 장 이상 선택할 수 있습니다.'
                      : `${selectedImageLayoutLabel}는 선택한 이미지를 하나의 그룹으로 묶습니다.`}
                </p>
              </fieldset>

              <div className="editor-input-note">
                <ShieldCheck aria-hidden="true" />
                <p>
                  {initialDraft?.images.length
                    ? '생성 이미지의 첨부 결과를 확인한 뒤 다음 단계로 이동합니다. BLOW는 이 단계에서 임시저장이나 최종 발행을 누르지 않습니다.'
                    : '원본 파일은 수정하거나 복사하지 않습니다. BLOW는 이미지 첨부 후에도 임시저장과 최종 발행을 누르지 않습니다.'}
                </p>
              </div>

              {imageError && error ? (
                <div className="editor-inline-error">
                  <XCircle aria-hidden="true" />
                  <div>
                    <strong>이미지를 첨부하지 못했습니다</strong>
                    <p>{error.message}</p>
                  </div>
                </div>
              ) : null}

              <button
                className="button primary image-attach-button"
                type="button"
                disabled={
                  isUiBusy ||
                  selectedImages.length === 0 ||
                  Boolean(imageResult) ||
                  imageRetryBlocked ||
                  imageLayoutNeedsMoreImages
                }
                onClick={() => void attachImages()}
              >
                {activeAction === 'images' ? (
                  <LoaderCircle className="is-spinning" aria-hidden="true" />
                ) : imageResult ? (
                  <Check aria-hidden="true" />
                ) : (
                  <ImagePlus aria-hidden="true" />
                )}
                {activeAction === 'images'
                  ? '첨부·검증 중…'
                  : imageResult
                    ? '첨부 확인 완료'
                    : `${selectedImageLayoutLabel} 첨부`}
              </button>
            </div>

            <aside className="image-test-summary" aria-label="이미지 첨부 범위">
              <Images aria-hidden="true" />
              <div>
                <h3>{imageResult ? '처리 결과' : '이번 단계에서 확인할 내용'}</h3>
                {imageResult ? (
                  <dl className="editor-result-values">
                    <div>
                      <dt>배치</dt>
                      <dd>{getImageLayoutLabel(imageResult.layout)}</dd>
                    </div>
                    <div>
                      <dt>선택</dt>
                      <dd>{imageResult.requestedCount}장</dd>
                    </div>
                    <div>
                      <dt>삽입</dt>
                      <dd>{imageResult.insertedCount}장</dd>
                    </div>
                  </dl>
                ) : (
                  <ol>
                    <li>JPG·PNG 파일만 안전하게 선택</li>
                    <li>네이버 사진 배치 방식에 선택값 적용</li>
                    <li>선택한 배치 구성 요소가 추가됐는지 확인</li>
                    <li>최종 삽입 개수와 선택 개수를 비교</li>
                  </ol>
                )}
              </div>
            </aside>
          </div>
        </section>
      ) : null}

      {inputResult && (!decorationPlan || decorationPlan.divider.enabled) ? (
        <section
          className="divider-test-panel optional-editor-panel"
          aria-labelledby="divider-test-heading"
          aria-busy={
            activeAction === 'divider-styles' ||
            activeAction === 'divider'
          }
        >
          <header className="panel-heading">
            <div>
              <h2 id="divider-test-heading">구분선</h2>
              <p>
                내용이 전환되거나 마무리되는 문단을 우선으로 구분선을 랜덤 배치합니다.
              </p>
            </div>
            <span className="document-state">
              {dividerResult
                ? '삽입 확인 완료'
                : dividerStyles.length > 0
                  ? '디자인 선택'
                  : '디자인 불러오기'}
            </span>
          </header>

          <div className="divider-test-layout">
            <div className="divider-test-form">
              <DecorationPlacementFields id="transfer-divider" value={placements.divider}
                disabled={isUiBusy || decorationStarted.current.divider || Boolean(dividerResult)}
                onChange={(placement) => {
                  setPlacements((current) => ({ ...current, divider: { ...current.divider, ...placement } }));
                  setDividerStyles([]);
                  setError(null);
                }} />
              <p className="field-help" role="status">
                실제 배치: {decorationTargets.divider.length}회
                {decorationTargets.divider.length < placements.divider.count
                  ? ' — 짧은 글이거나 적절한 위치가 부족해 횟수를 줄였습니다.' : ' — 내용 전환·마무리 위치를 우선으로 골랐습니다.'}
              </p>
              {decorationStarted.current.divider ? <p className="field-help" role="status">
                삽입 확인 {decorationProgress.divider}/{decorationTargets.divider.length}회
                {!dividerResult && activeAction !== 'divider' ? ' · 작업이 끝나지 않았습니다. 중복 삽입을 막기 위해 다시 실행하지 않습니다. Chrome에서 결과를 확인해 주세요.' : ''}
              </p> : null}

              <div className="divider-style-row">
                <div className="field-group">
                  <label htmlFor="divider-style">
                    구분선 디자인 <span>필수 · 하나만 선택</span>
                  </label>
                  <select
                    id="divider-style"
                    value={dividerStyleSelection}
                    disabled={
                      isUiBusy ||
                      dividerStyles.length === 0 ||
                      Boolean(dividerResult) ||
                      dividerRetryBlocked
                    }
                    aria-describedby="divider-style-help"
                    onChange={(event) => {
                      setDividerStyleSelection(
                        event.target.value as NaverDividerStyleSelection,
                      );
                      setError(null);
                    }}
                  >
                    <option value="random">무작위 (추천)</option>
                    {dividerStyleSelection !== 'random' && !dividerStyles.some((style) => style.id === dividerStyleSelection) ? (
                      <option value={dividerStyleSelection} disabled>
                        {dividerStyles.length ? '선택한 디자인 없음 · 다시 선택' : '미리 선택한 디자인 · 목록 확인 필요'}
                      </option>
                    ) : null}
                    {dividerStyles.map((style) => (
                      <option value={style.id} key={style.id}>
                        {style.label}
                      </option>
                    ))}
                  </select>
                  <p id="divider-style-help" className="field-help">
                    {dividerStyles.length > 0
                      ? dividerStyles.length +
                        '개 디자인을 불러왔습니다. 무작위 또는 특정 디자인 하나를 선택해 주세요.'
                      : '네이버 구분선 선택창의 실제 디자인을 먼저 불러옵니다.'}
                  </p>
                </div>

                <button
                  className="button secondary divider-style-load-button"
                  type="button"
                  disabled={
                    isUiBusy ||
                    Boolean(dividerResult) ||
                    dividerRetryBlocked
                  }
                  onClick={() => void loadDividerStyles()}
                >
                  {activeAction === 'divider-styles' ? (
                    <LoaderCircle className="is-spinning" aria-hidden="true" />
                  ) : (
                    <Minus aria-hidden="true" />
                  )}
                  {activeAction === 'divider-styles'
                    ? '디자인 확인 중…'
                    : dividerStyles.length > 0
                      ? '디자인 다시 불러오기'
                      : '구분선 디자인 불러오기'}
                </button>
              </div>

              <div className="editor-input-note">
                <ShieldCheck aria-hidden="true" />
                <p>
                  문단 원문, 선택한 디자인, 구분선 개수와 실제 순서를 다시 확인합니다. 어느 하나라도 확정하지 못하면 중복 삽입 없이 작업을 멈춥니다.
                </p>
              </div>

              {dividerError && error ? (
                <div className="editor-inline-error">
                  <XCircle aria-hidden="true" />
                  <div>
                    <strong>구분선을 삽입하지 못했습니다</strong>
                    <p>{error.message}</p>
                  </div>
                </div>
              ) : null}

              <button
                className="button primary divider-insert-button"
                type="button"
                disabled={
                  isUiBusy ||
                  !isDecorationStyleAvailable(dividerStyleSelection, dividerStyles) ||
                  Boolean(dividerResult) ||
                  dividerRetryBlocked
                }
                onClick={() => void insertDivider()}
              >
                {activeAction === 'divider' ? (
                  <LoaderCircle className="is-spinning" aria-hidden="true" />
                ) : dividerResult ? (
                  <Check aria-hidden="true" />
                ) : (
                  <Minus aria-hidden="true" />
                )}
                {activeAction === 'divider'
                  ? '삽입·검증 중…'
                  : dividerResult
                    ? '삽입 확인 완료'
                    : `구분선 ${decorationTargets.divider.length}회 삽입`}
              </button>
            </div>

            <aside
              className="divider-test-summary"
              aria-label="구분선 위치 선택 범위"
            >
              <Minus aria-hidden="true" />
              <div>
                <h3>
                  {dividerResult ? '처리 결과' : '이번 단계에서 확인할 내용'}
                </h3>
                {dividerResult ? (
                  <dl className="editor-result-values">
                    <div>
                      <dt>배치</dt>
                      <dd>{decorationPlacementLabel(placements.divider)}</dd>
                    </div>
                    <div>
                      <dt>디자인</dt>
                      <dd>{dividerResult.styleLabel ?? '기본 구분선'}</dd>
                    </div>
                    <div>
                      <dt>구분선</dt>
                      <dd>{decorationProgress.divider}회 확인</dd>
                    </div>
                  </dl>
                ) : (
                  <ol>
                    <li>본문 문단이 입력 원문과 같은지 확인</li>
                    <li>글 길이를 기준으로 정한 문단 사이에 커서 지정</li>
                    <li>현재 네이버 편집기의 구분선 디자인 목록 확인</li>
                    <li>위치마다 한 번씩 삽입하고 확인 후 다음 위치 진행</li>
                    <li>디자인·삽입 개수·문단 앞뒤 순서를 재확인</li>
                  </ol>
                )}
              </div>
            </aside>
          </div>
        </section>
      ) : null}
      {inputResult && (!decorationPlan || decorationPlan.sticker.enabled) ? (
        <section
          className="divider-test-panel sticker-test-panel optional-editor-panel"
          aria-labelledby="sticker-test-heading"
          aria-busy={
            activeAction === 'sticker-categories' ||
            activeAction === 'sticker'
          }
        >
          <header className="panel-heading">
            <div>
              <h2 id="sticker-test-heading">스티커</h2>
              <p>
                사용 가능한 묶음 하나를 선택하면 각 배치 위치에 스티커를 무작위로 넣습니다.
              </p>
            </div>
            <span className="document-state">
              {stickerResult
                ? '삽입 확인 완료'
                : stickerCategories.length > 0
                  ? '묶음 선택'
                  : '묶음 불러오기'}
            </span>
          </header>

          <div className="divider-test-layout">
            <div className="divider-test-form">
              <DecorationPlacementFields id="transfer-sticker" value={placements.sticker}
                disabled={isUiBusy || decorationStarted.current.sticker || Boolean(stickerResult)}
                onChange={(placement) => {
                  setPlacements((current) => ({ ...current, sticker: { ...current.sticker, ...placement } }));
                  setStickerCategories([]); setStickerCategoryId('');
                  setError(null);
                }} />
              <p className="field-help" role="status">
                실제 배치: {decorationTargets.sticker.length}회
                {decorationTargets.sticker.length < placements.sticker.count
                  ? ' — 짧은 글이거나 적절한 위치가 부족해 횟수를 줄였습니다.' : ' — 내용 전환·마무리 위치를 우선으로 골랐습니다.'}
              </p>
              {decorationStarted.current.sticker ? <p className="field-help" role="status">
                삽입 확인 {decorationProgress.sticker}/{decorationTargets.sticker.length}회
                {!stickerResult && activeAction !== 'sticker' ? ' · 작업이 끝나지 않았습니다. 중복 삽입을 막기 위해 다시 실행하지 않습니다. Chrome에서 결과를 확인해 주세요.' : ''}
              </p> : null}

              <div className="sticker-category-row">
                <div className="field-group">
                  <label htmlFor="sticker-category">
                    스티커 묶음 <span>필수 · 하나만 선택</span>
                  </label>
                  <select
                    id="sticker-category"
                    value={stickerCategoryId}
                    disabled={
                      isUiBusy ||
                      stickerCategories.length === 0 ||
                      Boolean(stickerResult) ||
                      stickerRetryBlocked
                    }
                    aria-describedby="sticker-category-help"
                    onChange={(event) => {
                      setStickerCategoryId(event.target.value);
                      setError(null);
                    }}
                  >
                    <option value="">묶음을 선택해 주세요</option>
                    {stickerCategories.map((category) => (
                      <option value={category.id} key={category.id}>
                        {category.label}
                      </option>
                    ))}
                  </select>
                  <p id="sticker-category-help" className="field-help">
                    {stickerCategories.length > 0
                      ? `${stickerCategories.length}개 묶음을 불러왔습니다. 사용할 묶음 하나를 선택해 주세요.`
                      : '네이버 스티커 창의 실제 묶음을 먼저 불러옵니다.'}
                  </p>
                </div>

                <button
                  className="button secondary sticker-category-load-button"
                  type="button"
                  disabled={
                    isUiBusy ||
                    Boolean(stickerResult) ||
                    stickerRetryBlocked
                  }
                  onClick={() => void loadStickerCategories()}
                >
                  {activeAction === 'sticker-categories' ? (
                    <LoaderCircle className="is-spinning" aria-hidden="true" />
                  ) : (
                    <Sticker aria-hidden="true" />
                  )}
                  {activeAction === 'sticker-categories'
                    ? '묶음 확인 중…'
                    : stickerCategories.length > 0
                      ? '묶음 다시 불러오기'
                      : '스티커 묶음 불러오기'}
                </button>
              </div>

              <div className="editor-input-note">
                <ShieldCheck aria-hidden="true" />
                <p>
                  각 위치마다 선택한 묶음에서 스티커를 무작위로 고릅니다. 본문 원문과 스티커 개수, 실제 순서를 다시 확인하며 항목을 확실히 식별하지 못하면 작업을 멈춥니다.
                </p>
              </div>

              {stickerError && error ? (
                <div className="editor-inline-error">
                  <XCircle aria-hidden="true" />
                  <div>
                    <strong>스티커 작업을 완료하지 못했습니다</strong>
                    <p>{error.message}</p>
                  </div>
                </div>
              ) : null}

              <button
                className="button primary divider-insert-button"
                type="button"
                disabled={
                  isUiBusy ||
                  !stickerCategoryId ||
                  Boolean(stickerResult) ||
                  stickerRetryBlocked
                }
                onClick={() => void insertRandomSticker()}
              >
                {activeAction === 'sticker' ? (
                  <LoaderCircle className="is-spinning" aria-hidden="true" />
                ) : stickerResult ? (
                  <Check aria-hidden="true" />
                ) : (
                  <Sticker aria-hidden="true" />
                )}
                {activeAction === 'sticker'
                  ? '무작위 삽입·검증 중…'
                  : stickerResult
                    ? '삽입 확인 완료'
                    : `스티커 ${decorationTargets.sticker.length}회 삽입`}
              </button>
            </div>

            <aside
              className="divider-test-summary"
              aria-label="스티커 묶음과 무작위 삽입 범위"
            >
              <Sticker aria-hidden="true" />
              <div>
                <h3>
                  {stickerResult ? '처리 결과' : '이번 단계에서 확인할 내용'}
                </h3>
                {stickerResult ? (
                  <dl className="editor-result-values">
                    <div>
                      <dt>배치</dt>
                      <dd>{decorationPlacementLabel(placements.sticker)}</dd>
                    </div>
                    <div>
                      <dt>묶음</dt>
                      <dd>{stickerResult.categoryLabel ?? '선택한 묶음'}</dd>
                    </div>
                    <div>
                      <dt>선택 항목</dt>
                      <dd>{stickerResult.stickerLabel}</dd>
                    </div>
                    <div>
                      <dt>스티커</dt>
                      <dd>{decorationProgress.sticker}회 확인</dd>
                    </div>
                  </dl>
                ) : (
                  <ol>
                    <li>전용 Chrome에 표시된 스티커 묶음 확인</li>
                    <li>사용자가 선택한 묶음 하나만 조작</li>
                    <li>선택한 묶음 안에서 한 항목을 무작위 선택</li>
                    <li>삽입 개수와 문단 앞·뒤 순서를 재확인</li>
                  </ol>
                )}
              </div>
            </aside>
          </div>
        </section>
      ) : null}
      {inputResult && (!decorationPlan || decorationPlan.quote.enabled) ? (
        <section
          className="divider-test-panel quote-test-panel optional-editor-panel"
          aria-labelledby="quote-test-heading"
          aria-busy={
            activeAction === 'quote-styles' ||
            activeAction === 'quote'
          }
        >
          <header className="panel-heading">
            <div>
              <h2 id="quote-test-heading">인용구</h2>
              <p>
                내용이 전환되거나 마무리되는 문단을 우선으로 인용구 디자인을 랜덤 배치합니다.
              </p>
            </div>
            <span className="document-state">
              {quoteResult
                ? '삽입 확인 완료'
                : quoteStyles.length > 0
                  ? '디자인 선택'
                  : '디자인 불러오기'}
            </span>
          </header>

          <div className="divider-test-layout">
            <div className="divider-test-form">
              <DecorationPlacementFields id="transfer-quote" value={placements.quote}
                disabled={isUiBusy || decorationStarted.current.quote || Boolean(quoteResult)}
                onChange={(placement) => {
                  setPlacements((current) => ({ ...current, quote: { ...current.quote, ...placement } }));
                  setQuoteStyles([]);
                  setError(null);
                }} />
              <p className="field-help" role="status">
                실제 배치: {decorationTargets.quote.length}회
                {decorationTargets.quote.length < placements.quote.count
                  ? ' — 짧은 글이거나 적절한 위치가 부족해 횟수를 줄였습니다.' : ' — 내용 전환·마무리 위치를 우선으로 골랐습니다.'}
              </p>
              {decorationStarted.current.quote ? <p className="field-help" role="status">
                삽입 확인 {decorationProgress.quote}/{decorationTargets.quote.length}회
                {!quoteResult && activeAction !== 'quote' ? ' · 작업이 끝나지 않았습니다. 중복 삽입을 막기 위해 다시 실행하지 않습니다. Chrome에서 결과를 확인해 주세요.' : ''}
              </p> : null}

              <div className="divider-style-row">
                <div className="field-group">
                  <label htmlFor="quote-style">
                    인용구 디자인 <span>필수 · 하나만 선택</span>
                  </label>
                  <select
                    id="quote-style"
                    value={quoteStyleSelection}
                    disabled={
                      isUiBusy ||
                      quoteStyles.length === 0 ||
                      Boolean(quoteResult) ||
                      quoteRetryBlocked
                    }
                    aria-describedby="quote-style-help"
                    onChange={(event) => {
                      setQuoteStyleSelection(
                        event.target.value as NaverQuoteStyleSelection,
                      );
                      setError(null);
                    }}
                  >
                    <option value="random">무작위 (추천)</option>
                    {quoteStyleSelection !== 'random' && !quoteStyles.some((style) => style.id === quoteStyleSelection) ? (
                      <option value={quoteStyleSelection} disabled>
                        {quoteStyles.length ? '선택한 디자인 없음 · 다시 선택' : '미리 선택한 디자인 · 목록 확인 필요'}
                      </option>
                    ) : null}
                    {quoteStyles.map((style) => (
                      <option value={style.id} key={style.id}>
                        {style.label}
                      </option>
                    ))}
                  </select>
                  <p id="quote-style-help" className="field-help">
                    {quoteStyles.length > 0
                      ? quoteStyles.length +
                        '개 디자인을 불러왔습니다. 무작위 또는 특정 디자인 하나를 선택해 주세요.'
                      : '네이버 인용구 선택창의 실제 디자인을 먼저 불러옵니다.'}
                  </p>
                </div>

                <button
                  className="button secondary divider-style-load-button"
                  type="button"
                  disabled={
                    isUiBusy ||
                    Boolean(quoteResult) ||
                    quoteRetryBlocked
                  }
                  onClick={() => void loadQuoteStyles()}
                >
                  {activeAction === 'quote-styles' ? (
                    <LoaderCircle className="is-spinning" aria-hidden="true" />
                  ) : (
                    <Quote aria-hidden="true" />
                  )}
                  {activeAction === 'quote-styles'
                    ? '디자인 확인 중…'
                    : quoteStyles.length > 0
                      ? '디자인 다시 불러오기'
                      : '인용구 디자인 불러오기'}
                </button>
              </div>

              <div className="editor-input-note">
                <ShieldCheck aria-hidden="true" />
                <p>
                  문단 원문, 선택한 디자인, 인용구 개수와 실제 순서를 다시 확인합니다. 어느 하나라도 확정하지 못하면 중복 삽입 없이 작업을 멈춥니다.
                </p>
              </div>

              {quoteError && error ? (
                <div className="editor-inline-error">
                  <XCircle aria-hidden="true" />
                  <div>
                    <strong>인용구를 삽입하지 못했습니다</strong>
                    <p>{error.message}</p>
                  </div>
                </div>
              ) : null}

              <button
                className="button primary divider-insert-button"
                type="button"
                disabled={
                  isUiBusy ||
                  !isDecorationStyleAvailable(quoteStyleSelection, quoteStyles) ||
                  Boolean(quoteResult) ||
                  quoteRetryBlocked
                }
                onClick={() => void insertQuote()}
              >
                {activeAction === 'quote' ? (
                  <LoaderCircle className="is-spinning" aria-hidden="true" />
                ) : quoteResult ? (
                  <Check aria-hidden="true" />
                ) : (
                  <Quote aria-hidden="true" />
                )}
                {activeAction === 'quote'
                  ? '삽입·검증 중…'
                  : quoteResult
                    ? '삽입 확인 완료'
                    : `인용구 ${decorationTargets.quote.length}회 삽입`}
              </button>
            </div>

            <aside
              className="divider-test-summary"
              aria-label="인용구 위치와 디자인 선택 범위"
            >
              <Quote aria-hidden="true" />
              <div>
                <h3>
                  {quoteResult ? '처리 결과' : '이번 단계에서 확인할 내용'}
                </h3>
                {quoteResult ? (
                  <dl className="editor-result-values">
                    <div>
                      <dt>배치</dt>
                      <dd>{decorationPlacementLabel(placements.quote)}</dd>
                    </div>
                    <div>
                      <dt>디자인</dt>
                      <dd>{quoteResult.styleLabel ?? '기본 인용구'}</dd>
                    </div>
                    <div>
                      <dt>인용구</dt>
                      <dd>{decorationProgress.quote}회 확인</dd>
                    </div>
                  </dl>
                ) : (
                  <ol>
                    <li>본문 문단이 입력 원문과 같은지 확인</li>
                    <li>글 길이를 기준으로 정한 문단 사이에 커서 지정</li>
                    <li>현재 네이버 편집기의 인용구 디자인 목록 확인</li>
                    <li>위치마다 한 번씩 삽입하고 확인 후 다음 위치 진행</li>
                    <li>디자인·삽입 개수·문단 앞뒤 순서를 재확인</li>
                  </ol>
                )}
              </div>
            </aside>
          </div>
        </section>
      ) : null}
      {inputResult ? (
        <section
          className="divider-test-panel"
          aria-labelledby="draft-save-heading"
          aria-busy={activeAction === 'save-draft'}
        >
          <header className="panel-heading">
            <div>
              <h2 id="draft-save-heading">네이버 임시저장</h2>
              <p>
                선택한 이미지와 꾸미기를 확인한 뒤 저장하세요. 꾸미기를 생략하고 저장할 수도 있습니다.
              </p>
            </div>
            <span className="document-state">
              {draftSaveResult
                ? '임시저장 실행 완료'
                : activeAction === 'save-draft'
                  ? '임시저장 실행 중'
                  : '저장 전'}
            </span>
          </header>

          <div className="divider-test-layout">
            <div className="divider-test-form">
              <div className="editor-input-note">
                <ShieldCheck aria-hidden="true" />
                <p>
                  네이버의 저장 버튼은 한 번만 조작하며 자동으로 다시 누르지 않습니다. 최종 발행은 실행하지 않습니다.
                </p>
              </div>

              {decorationPlan && (
                (decorationPlan.divider.enabled && !dividerResult) ||
                (decorationPlan.sticker.enabled && !stickerResult) ||
                (decorationPlan.quote.enabled && !quoteResult)
              ) ? (
                <p className="field-help" role="status">미리 선택한 꾸미기 중 완료되지 않은 항목이 있습니다. 지금 저장하면 실제 삽입이 확인된 내용까지만 반영됩니다.</p>
              ) : null}
              {draftSaveError && error ? (
                <div className="editor-inline-error">
                  <XCircle aria-hidden="true" />
                  <div>
                    <strong>임시저장을 실행하지 못했습니다</strong>
                    <p>{error.message}</p>
                  </div>
                </div>
              ) : null}

              <button
                className="button primary divider-insert-button"
                type="button"
                disabled={
                  isUiBusy ||
                  Boolean(draftSaveResult) ||
                  draftSaveRetryBlocked
                }
                onClick={() => void saveDraft()}
              >
                {activeAction === 'save-draft' ? (
                  <LoaderCircle className="is-spinning" aria-hidden="true" />
                ) : draftSaveResult ? (
                  <Check aria-hidden="true" />
                ) : (
                  <Save aria-hidden="true" />
                )}
                {activeAction === 'save-draft'
                  ? '임시저장 실행 중…'
                  : draftSaveResult
                    ? '임시저장 실행 완료'
                    : '임시저장 실행'}
              </button>
            </div>

            <aside
              className="divider-test-summary"
              aria-label="네이버 임시저장 처리 범위"
            >
              <Save aria-hidden="true" />
              <div>
                <h3>
                  {draftSaveResult
                    ? '처리 결과'
                    : '이번 단계에서 확인할 내용'}
                </h3>
                {draftSaveResult ? (
                  <dl className="editor-result-values">
                    <div>
                      <dt>저장 결과</dt>
                      <dd>임시저장 실행 완료</dd>
                    </div>

                    <div>
                      <dt>처리 기록</dt>
                      <dd>
                        {draftSaveResult.signals
                          .map((signal) => signal.label)
                          .join(' · ')}
                      </dd>
                    </div>
                    <div>
                      <dt>최종 발행</dt>
                      <dd>실행하지 않음</dd>
                    </div>
                  </dl>
                ) : (
                  <ol>
                    <li>사진·서식 단계를 건너뛰고 바로 실행 가능</li>
                    <li>제목과 본문이 입력 원문과 같은지 확인</li>
                    <li>표시된 저장 버튼이 정확히 하나인지 확인</li>
                    <li>저장 버튼 조작이 오류 없이 완료됐는지 확인</li>
                    <li>네이버 응답과 개수 변화는 참고 정보로 수집</li>
                    <li>최종 발행 기능은 탐색하거나 조작하지 않음</li>
                  </ol>
                )}
              </div>
            </aside>
          </div>
        </section>
      ) : null}
      </div>
    </div>
  );
}

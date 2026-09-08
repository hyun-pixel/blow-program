import {
  Check,
  CheckCircle2,
  Circle,
  ExternalLink,
  FileText,
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
  X,
  XCircle,
} from 'lucide-react';
import {
  useEffect,
  useRef,
  useState,
} from 'react';
import type {
  NaverConnectionStatus,
  NaverDividerInsertionResult,
  NaverDividerPosition,
  NaverDividerStyle,
  NaverDividerStyleSelection,
  NaverDraftSaveResult,
  NaverEditorInputResult,
  NaverImageAttachmentResult,
  NaverImageLayout,
  NaverSelectedImageFile,
  NaverQuoteInsertionResult,
  NaverQuotePosition,
  NaverQuoteStyle,
  NaverQuoteStyleSelection,
  NaverStickerCategory,
  NaverStickerInsertionResult,
  NaverStickerPosition,
  NaverUserInteractionResult,
  NaverUserInteractionType,
} from '@blow/naver-adapter';

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

const sampleTitle = '[BLOW 입력 테스트] 네이버 편집기 확인';
const sampleBody = [
  'BLOW가 제목과 본문 입력을 확인하는 테스트 글입니다.',
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

const dividerPositionOptions: readonly {
  readonly value: NaverDividerPosition;
  readonly label: string;
  readonly description: string;
}[] = [
  {
    value: 'before',
    label: '문단 앞',
    description: '선택한 문단이 시작되기 전에 넣습니다.',
  },
  {
    value: 'after',
    label: '문단 뒤',
    description: '선택한 문단이 끝난 다음에 넣습니다.',
  },
];

function getDividerPositionLabel(position: NaverDividerPosition): string {
  return dividerPositionOptions.find(
    (option) => option.value === position,
  )!.label;
}

const stickerPositionOptions: readonly {
  readonly value: NaverStickerPosition;
  readonly label: string;
  readonly description: string;
}[] = [
  {
    value: 'before',
    label: '문단 앞',
    description: '선택한 문단이 시작되기 전에 넣습니다.',
  },
  {
    value: 'after',
    label: '문단 뒤',
    description: '선택한 문단이 끝난 다음에 넣습니다.',
  },
];

function getStickerPositionLabel(position: NaverStickerPosition): string {
  return stickerPositionOptions.find(
    (option) => option.value === position,
  )!.label;
}

const quotePositionOptions: readonly {
  readonly value: NaverQuotePosition;
  readonly label: string;
  readonly description: string;
}[] = [
  {
    value: 'before',
    label: '문단 앞',
    description: '선택한 문단이 시작되기 전에 넣습니다.',
  },
  {
    value: 'after',
    label: '문단 뒤',
    description: '선택한 문단이 끝난 다음에 넣습니다.',
  },
];

function getQuotePositionLabel(position: NaverQuotePosition): string {
  return quotePositionOptions.find(
    (option) => option.value === position,
  )!.label;
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

export function ConnectionScreen() {
  const [blogUrl, setBlogUrl] = useState('');
  const blogUrlInputRef = useRef<HTMLInputElement>(null);
  const draftTitleInputRef = useRef<HTMLInputElement>(null);
  const draftBodyInputRef = useRef<HTMLTextAreaElement>(null);
  const [status, setStatus] = useState<NaverConnectionStatus | null>(null);
  const [browserOpen, setBrowserOpen] = useState(false);
  const [draftTitle, setDraftTitle] = useState(sampleTitle);
  const [draftBody, setDraftBody] = useState(sampleBody);
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
  const [interactionResult, setInteractionResult] =
    useState<NaverUserInteractionResult | null>(null);
  const [interactionError, setInteractionError] = useState<string | null>(null);
  const [dividerParagraphNumber, setDividerParagraphNumber] = useState(1);
  const [dividerPosition, setDividerPosition] =
    useState<NaverDividerPosition>('after');
  const [dividerResult, setDividerResult] =
    useState<NaverDividerInsertionResult | null>(null);
  const [dividerStyles, setDividerStyles] = useState<
    readonly NaverDividerStyle[]
  >([]);
  const [dividerStyleSelection, setDividerStyleSelection] =
    useState<NaverDividerStyleSelection>('random');
  const [stickerParagraphNumber, setStickerParagraphNumber] = useState(1);
  const [stickerPosition, setStickerPosition] =
    useState<NaverStickerPosition>('after');
  const [stickerCategories, setStickerCategories] = useState<
    readonly NaverStickerCategory[]
  >([]);
  const [stickerCategoryId, setStickerCategoryId] = useState('');
  const [stickerResult, setStickerResult] =
    useState<NaverStickerInsertionResult | null>(null);
  const [quoteParagraphNumber, setQuoteParagraphNumber] = useState(1);
  const [quotePosition, setQuotePosition] =
    useState<NaverQuotePosition>('after');
  const [quoteStyles, setQuoteStyles] = useState<
    readonly NaverQuoteStyle[]
  >([]);
  const [quoteStyleSelection, setQuoteStyleSelection] =
    useState<NaverQuoteStyleSelection>('random');
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
  const [isStopping, setIsStopping] = useState(false);
  const [stopNotice, setStopNotice] = useState(false);

  const isActivelyRunning = activeAction !== null || isStopping;
  const isInteractionPaused = error?.code === 'USER_INTERACTION_DETECTED';
  const isUiBusy = isActivelyRunning || isInteractionPaused;
  const isAutoChecking =
    browserOpen &&
    !error &&
    (status?.stage === 'LOGIN_REQUIRED' || status?.stage === 'HOME_READY');
  const fieldError = error?.code === 'INVALID_BLOG_URL'
    ? error.message
    : null;

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

  const runConnectionCommand = async (
    action: 'open' | 'verify' | 'writer',
    command: () => ReturnType<typeof window.blowNaver.open>,
  ): Promise<void> => {
    const operationVersion = beginOperation(action);
    setError(null);

    try {
      const response = await command();

      if (!isOperationCurrent(operationVersion)) {
        return;
      }

      if (response.ok) {
        setStatus(response.status);

        if (action === 'open') {
          setBrowserOpen(true);
        }

        if (action === 'open' || action === 'writer') {
          setInputResult(null);
          setDividerParagraphNumber(1);
          setDividerPosition('after');
          setDividerStyles([]);
          setDividerStyleSelection('random');
          setDividerResult(null);
          setStickerParagraphNumber(1);
          setStickerPosition('after');
          setStickerCategories([]);
          setStickerCategoryId('');
          setStickerResult(null);
          setQuoteParagraphNumber(1);
          setQuotePosition('after');
          setQuoteStyles([]);
          setQuoteStyleSelection('random');
          setQuoteResult(null);
          setDraftSaveResult(null);
          setInteractionResult(null);
          setInteractionError(null);
          setSelectedImages([]);
          setImageLayout('individual');
          setImageResult(null);
        }
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
        return;
      }

      setError({
        code: 'NAVER_CONNECTION_FAILED',
        message: '네이버 연결 상태를 확인하지 못했습니다. 다시 시도해 주세요.',
      });
    } finally {
      finishOperation(operationVersion);
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

    if (status?.stage === 'WRITER_LINK_READY') {
      void runConnectionCommand(
        'writer',
        () => window.blowNaver.openWriter(),
      );
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
      setDividerParagraphNumber(1);
      setDividerPosition('after');
      setDividerStyles([]);
      setDividerStyleSelection('random');
      setDividerResult(null);
      setStickerParagraphNumber(1);
      setStickerPosition('after');
      setStickerCategories([]);
      setStickerCategoryId('');
      setStickerResult(null);
      setQuoteParagraphNumber(1);
      setQuotePosition('after');
      setQuoteStyles([]);
      setQuoteStyleSelection('random');
      setQuoteResult(null);
      setDraftSaveResult(null);
      setInteractionResult(null);
      setInteractionError(null);
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
      title: title ? '' : '테스트할 제목을 입력해 주세요.',
      body: paragraphs.length > 0
        ? ''
        : '테스트할 본문을 입력해 주세요.',
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
    setDividerStyles([]);
    setDividerStyleSelection('random');
    setDividerResult(null);
    setStickerCategories([]);
    setStickerCategoryId('');
    setStickerResult(null);
    setQuoteParagraphNumber(1);
    setQuotePosition('after');
    setQuoteStyles([]);
    setQuoteStyleSelection('random');
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
        setDividerParagraphNumber(1);
        setDividerPosition('after');
        setDividerStyles([]);
        setDividerStyleSelection('random');
        setDividerResult(null);
        setSelectedImages([]);
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
        setDividerStyles([]);
        setDividerStyleSelection('random');
        setDividerResult(null);
        setStickerCategories([]);
        setStickerCategoryId('');
        setStickerResult(null);
        setQuoteParagraphNumber(1);
        setQuotePosition('after');
        setQuoteStyles([]);
        setQuoteStyleSelection('random');
        setQuoteResult(null);
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
        message: '구분선을 넣을 문단과 위치를 다시 선택해 주세요.',
      });
      return;
    }

    const operationVersion = beginOperation('divider-styles');
    setDividerStyles([]);
    setDividerStyleSelection('random');
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

  const insertDivider = async (): Promise<void> => {
    if (
      dividerParagraphNumber < 1 ||
      dividerParagraphNumber > draftParagraphs.length
    ) {
      setError({
        code: 'INVALID_DIVIDER_REQUEST',
        message: '구분선을 넣을 문단과 위치를 다시 선택해 주세요.',
      });
      return;
    }

    if (dividerStyles.length === 0) {
      setError({
        code: 'DIVIDER_STYLE_NOT_FOUND',
        message: '구분선 디자인을 먼저 불러와 주세요.',
      });
      return;
    }

    const operationVersion = beginOperation('divider');
    setDividerResult(null);
    setError(null);

    try {
      const response = await window.blowNaver.insertDivider(
        dividerParagraphNumber,
        dividerPosition,
        dividerStyleSelection,
      );

      if (!isOperationCurrent(operationVersion)) {
        return;
      }

      if (response.ok) {
        setDividerResult(response.result);
        setStickerParagraphNumber(1);
        setStickerPosition('after');
        setStickerResult(null);
        setQuoteParagraphNumber(1);
        setQuotePosition('after');
        setQuoteStyles([]);
        setQuoteStyleSelection('random');
        setQuoteResult(null);
        setDraftSaveResult(null);
      } else {
        setError(response.error);
      }
    } catch {
      if (!isOperationCurrent(operationVersion)) {
        return;
      }

      setError({
        code: 'DIVIDER_INSERT_UNCONFIRMED',
        message: '구분선 삽입을 완료하지 못했습니다. Chrome 화면을 확인해 주세요.',
      });
    } finally {
      finishOperation(operationVersion);
    }
  };

  const loadStickerCategories = async (): Promise<void> => {
    if (
      stickerParagraphNumber < 1 ||
      stickerParagraphNumber > draftParagraphs.length
    ) {
      setError({
        code: 'INVALID_STICKER_REQUEST',
        message: '스티커를 넣을 문단과 위치를 다시 선택해 주세요.',
      });
      return;
    }

    const operationVersion = beginOperation('sticker-categories');
    setStickerCategories([]);
    setStickerCategoryId('');
    setStickerResult(null);
    setQuoteParagraphNumber(1);
    setQuotePosition('after');
    setQuoteStyles([]);
    setQuoteStyleSelection('random');
    setQuoteResult(null);
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
    if (
      stickerParagraphNumber < 1 ||
      stickerParagraphNumber > draftParagraphs.length ||
      !stickerCategoryId
    ) {
      setError({
        code: 'INVALID_STICKER_REQUEST',
        message: '스티커를 넣을 문단·위치·묶음을 다시 선택해 주세요.',
      });
      return;
    }

    const operationVersion = beginOperation('sticker');
    setStickerResult(null);
    setQuoteParagraphNumber(1);
    setQuotePosition('after');
    setQuoteStyles([]);
    setQuoteStyleSelection('random');
    setQuoteResult(null);
    setDraftSaveResult(null);
    setError(null);

    try {
      const response = await window.blowNaver.insertRandomSticker(
        stickerParagraphNumber,
        stickerPosition,
        stickerCategoryId,
      );

      if (!isOperationCurrent(operationVersion)) {
        return;
      }

      if (response.ok) {
        setStickerResult(response.result);
        setQuoteParagraphNumber(1);
        setQuotePosition('after');
        setQuoteStyles([]);
        setQuoteStyleSelection('random');
        setQuoteResult(null);
        setDraftSaveResult(null);
      } else {
        if (response.error.code === 'STICKER_CATEGORY_STALE') {
          setStickerCategories([]);
          setStickerCategoryId('');
        }

        setError(response.error);
      }
    } catch {
      if (!isOperationCurrent(operationVersion)) {
        return;
      }

      setError({
        code: 'STICKER_INSERT_UNCONFIRMED',
        message: '스티커 삽입을 완료하지 못했습니다. Chrome 화면을 확인해 주세요.',
      });
    } finally {
      finishOperation(operationVersion);
    }
  };
  const loadQuoteStyles = async (): Promise<void> => {
    if (
      quoteParagraphNumber < 1 ||
      quoteParagraphNumber > draftParagraphs.length
    ) {
      setError({
        code: 'INVALID_QUOTE_REQUEST',
        message: '인용구를 넣을 문단과 위치를 다시 선택해 주세요.',
      });
      return;
    }

    const operationVersion = beginOperation('quote-styles');
    setQuoteStyles([]);
    setQuoteStyleSelection('random');
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
    if (
      quoteParagraphNumber < 1 ||
      quoteParagraphNumber > draftParagraphs.length
    ) {
      setError({
        code: 'INVALID_QUOTE_REQUEST',
        message: '인용구를 넣을 문단과 위치를 다시 선택해 주세요.',
      });
      return;
    }

    if (quoteStyles.length === 0) {
      setError({
        code: 'QUOTE_STYLE_NOT_FOUND',
        message: '인용구 디자인을 먼저 불러와 주세요.',
      });
      return;
    }

    const operationVersion = beginOperation('quote');
    setQuoteResult(null);
    setDraftSaveResult(null);
    setError(null);

    try {
      const response = await window.blowNaver.insertQuote(
        quoteParagraphNumber,
        quotePosition,
        quoteStyleSelection,
      );

      if (!isOperationCurrent(operationVersion)) {
        return;
      }

      if (response.ok) {
        setQuoteResult(response.result);
      } else {
        if (response.error.code === 'QUOTE_STYLE_STALE') {
          setQuoteStyles([]);
          setQuoteStyleSelection('random');
        }

        setError(response.error);
      }
    } catch {
      if (!isOperationCurrent(operationVersion)) {
        return;
      }

      setError({
        code: 'QUOTE_INSERT_UNCONFIRMED',
        message: '인용구 삽입을 완료하지 못했습니다. Chrome 화면을 확인해 주세요.',
      });
    } finally {
      finishOperation(operationVersion);
    }
  };

  const saveDraft = async (): Promise<void> => {
    const operationVersion = beginOperation('save-draft');
    setDraftSaveResult(null);
    setError(null);

    try {
      const response = await window.blowNaver.saveDraft();

      if (!isOperationCurrent(operationVersion)) {
        return;
      }

      if (response.ok) {
        setDraftSaveResult(response.result);
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
          : !browserOpen
          ? '전용 Chrome 열기'
          : status?.stage === 'WRITER_LINK_READY'
            ? '글쓰기 화면 열기'
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
  const dividerRetryBlocked = [
    'DIVIDER_INSERT_UNCONFIRMED',
    'DIVIDER_STYLE_MISMATCH',
    'DIVIDER_POSITION_MISMATCH',
  ].includes(error?.code ?? '');
  const selectedDividerPositionLabel =
    getDividerPositionLabel(dividerPosition);
  const quoteError = error
    ? [
        'INVALID_QUOTE_REQUEST',
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
  const quoteRetryBlocked = [
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
  const stickerRetryBlocked = [
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
    <>
      <header className="page-head">
        <div>
          <h1>네이버 자동 입력 확인</h1>
          <p>
            등록 블로그를 연결한 뒤 네이버 편집기에 제목, 본문, 이미지와 서식을 안전하게 입력합니다.
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

      {interactionResult?.detected ? (
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
              {quoteResult.paragraphNumber}번째 문단의{' '}
              {getQuotePositionLabel(quoteResult.position)}에 기본 인용구가 삽입됐습니다.
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
              {stickerResult.paragraphNumber}번째 문단의{' '}
              {getStickerPositionLabel(stickerResult.position)}에{' '}
              {stickerResult.categoryLabel ?? '선택한 묶음'}의 무작위 스티커가
              삽입됐습니다. 임시저장과 최종 발행은 실행하지 않았습니다.
            </p>
          </div>
        </section>
      ) : dividerResult ? (
        <section className="message success-message" role="status">
          <CheckCircle2 aria-hidden="true" />
          <div>
            <h2>구분선 위치를 확인했습니다</h2>
            <p>
              {dividerResult.paragraphNumber}번째 문단의{' '}
              {getDividerPositionLabel(dividerResult.position)}에{' '}
              {dividerResult.styleLabel ?? '구분선'}이 삽입됐습니다.
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
              아래 테스트 문안을 확인한 뒤 제목·본문 입력을 시작할 수 있습니다.
            </p>
          </div>
        </section>
      ) : null}

      <section
        className="connection-workbench"
        aria-busy={isUiBusy || isAutoChecking}
        aria-labelledby="connection-form-heading"
      >
        <div className="connection-form-panel">
          <header className="panel-heading">
            <div>
              <h2 id="connection-form-heading">블로그 주소</h2>
              <p>본인이 관리하는 네이버 블로그 주소 한 개를 입력합니다.</p>
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
                isUiBusy ||
                isAutoChecking ||
                status?.stage === 'WRITER_READY'
              }
            >
              {isUiBusy || isAutoChecking ? (
                <LoaderCircle className="is-spinning" aria-hidden="true" />
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
              <h2 id="connection-progress-heading">연결 순서</h2>
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
            {connectionSteps.map((step, index) => {
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

      {status?.stage === 'WRITER_READY' ? (
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
      {status?.stage === 'WRITER_READY' ? (
        <section
          className="editor-test-panel"
          aria-labelledby="editor-test-heading"
          aria-busy={activeAction === 'input'}
        >
          <header className="panel-heading">
            <div>
              <h2 id="editor-test-heading">제목·본문 입력 테스트</h2>
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
                  테스트 제목 <span>필수</span>
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
                  테스트 본문 <span>필수</span>
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

            <aside className="editor-test-summary" aria-label="입력 테스트 범위">
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
          className="divider-test-panel"
          aria-labelledby="draft-save-heading"
          aria-busy={activeAction === 'save-draft'}
        >
          <header className="panel-heading">
            <div>
              <h2 id="draft-save-heading">네이버 임시저장</h2>
              <p>
                제목·본문 입력 직후 사진과 장식 테스트를 건너뛰고 바로 임시저장할 수 있습니다.
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
      {inputResult ? (
        <section
          className="image-test-panel"
          aria-labelledby="image-test-heading"
          aria-busy={activeAction === 'select-images' || activeAction === 'images'}
        >
          <header className="panel-heading">
            <div>
              <h2 id="image-test-heading">사진 배치 테스트</h2>
              <p>
                로컬 JPG 또는 PNG 파일과 배치 방식을 선택해 네이버 편집기에 첨부합니다.
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
                  파일 경로는 화면에 표시하거나 서버로 보내지 않습니다. 이번 단계에서는 JPG와 PNG만 지원합니다.
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
                  원본 파일은 수정하거나 복사하지 않습니다. BLOW는 이미지 첨부 후에도 임시저장과 최종 발행을 누르지 않습니다.
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

            <aside className="image-test-summary" aria-label="이미지 첨부 테스트 범위">
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

      {imageResult ? (
        <section
          className="divider-test-panel"
          aria-labelledby="divider-test-heading"
          aria-busy={
            activeAction === 'divider-styles' ||
            activeAction === 'divider'
          }
        >
          <header className="panel-heading">
            <div>
              <h2 id="divider-test-heading">구분선 위치·디자인 테스트</h2>
              <p>
                본문 위치와 디자인을 하나씩 선택해 네이버 편집기에 구분선을 넣습니다.
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
              <div className="divider-location-grid">
                <div className="field-group">
                  <label htmlFor="divider-paragraph">
                    기준 문단 <span>필수</span>
                  </label>
                  <select
                    id="divider-paragraph"
                    value={dividerParagraphNumber}
                    disabled={
                      isUiBusy ||
                      Boolean(dividerResult) ||
                      dividerRetryBlocked
                    }
                    aria-describedby="divider-paragraph-help"
                    onChange={(event) => {
                      setDividerParagraphNumber(Number(event.target.value));
                      setDividerStyles([]);
                      setDividerStyleSelection('random');
                      setError(null);
                    }}
                  >
                    {draftParagraphs.map((paragraph, index) => (
                      <option value={index + 1} key={index}>
                        {index + 1}번째 문단 ·{' '}
                        {paragraph.length > 30
                          ? `${paragraph.slice(0, 30)}…`
                          : paragraph}
                      </option>
                    ))}
                  </select>
                  <p id="divider-paragraph-help" className="field-help">
                    이번 기술검증에서는 입력이 확인된 본문 문단만 위치 기준으로 사용합니다.
                  </p>
                </div>

                <fieldset
                  className="divider-position-fieldset"
                  disabled={
                    isUiBusy ||
                    Boolean(dividerResult) ||
                    dividerRetryBlocked
                  }
                  aria-describedby="divider-position-help"
                >
                  <legend className="field-label">
                    삽입 위치 <span>필수</span>
                  </legend>
                  <div className="divider-position-options">
                    {dividerPositionOptions.map((option) => (
                      <label
                        className={`divider-position-option${
                          dividerPosition === option.value
                            ? ' is-selected'
                            : ''
                        }`}
                        key={option.value}
                      >
                        <input
                          type="radio"
                          name="divider-position"
                          value={option.value}
                          checked={dividerPosition === option.value}
                          onChange={() => {
                            setDividerPosition(option.value);
                            setDividerStyles([]);
                            setDividerStyleSelection('random');
                            setError(null);
                          }}
                        />
                        <span>
                          <strong>{option.label}</strong>
                          <small>{option.description}</small>
                        </span>
                        {dividerPosition === option.value ? (
                          <Check aria-hidden="true" />
                        ) : null}
                      </label>
                    ))}
                  </div>
                  <p id="divider-position-help" className="layout-selection-help">
                    위치를 바꾸면 현재 디자인 목록을 다시 불러옵니다.
                  </p>
                </fieldset>
              </div>

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
                  dividerStyles.length === 0 ||
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
                    : '구분선 삽입'}
              </button>
            </div>

            <aside
              className="divider-test-summary"
              aria-label="구분선 위치 테스트 범위"
            >
              <Minus aria-hidden="true" />
              <div>
                <h3>
                  {dividerResult ? '처리 결과' : '이번 단계에서 확인할 내용'}
                </h3>
                {dividerResult ? (
                  <dl className="editor-result-values">
                    <div>
                      <dt>기준</dt>
                      <dd>{dividerResult.paragraphNumber}번째 문단</dd>
                    </div>
                    <div>
                      <dt>위치</dt>
                      <dd>{getDividerPositionLabel(dividerResult.position)}</dd>
                    </div>
                    <div>
                      <dt>디자인</dt>
                      <dd>{dividerResult.styleLabel ?? '기본 구분선'}</dd>
                    </div>
                    <div>
                      <dt>구분선</dt>
                      <dd>{dividerResult.dividerCount}개</dd>
                    </div>
                  </dl>
                ) : (
                  <ol>
                    <li>본문 문단이 입력 원문과 같은지 확인</li>
                    <li>선택한 문단의 시작 또는 끝에 커서 지정</li>
                    <li>현재 네이버 편집기의 구분선 디자인 목록 확인</li>
                    <li>무작위 또는 선택한 디자인 한 개만 조작</li>
                    <li>디자인·삽입 개수·문단 앞뒤 순서를 재확인</li>
                  </ol>
                )}
              </div>
            </aside>
          </div>
        </section>
      ) : null}
      {dividerResult ? (
        <section
          className="divider-test-panel sticker-test-panel"
          aria-labelledby="sticker-test-heading"
          aria-busy={
            activeAction === 'sticker-categories' ||
            activeAction === 'sticker'
          }
        >
          <header className="panel-heading">
            <div>
              <h2 id="sticker-test-heading">스티커 묶음·무작위 삽입 테스트</h2>
              <p>
                전용 Chrome에 표시된 묶음 하나를 선택하고, 그 안의 스티커 한 개를 무작위로 넣습니다.
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
              <div className="divider-location-grid">
                <div className="field-group">
                  <label htmlFor="sticker-paragraph">
                    기준 문단 <span>필수</span>
                  </label>
                  <select
                    id="sticker-paragraph"
                    value={stickerParagraphNumber}
                    disabled={
                      isUiBusy ||
                      Boolean(stickerResult) ||
                      stickerRetryBlocked
                    }
                    aria-describedby="sticker-paragraph-help"
                    onChange={(event) => {
                      setStickerParagraphNumber(Number(event.target.value));
                      setStickerCategories([]);
                      setStickerCategoryId('');
                      setError(null);
                    }}
                  >
                    {draftParagraphs.map((paragraph, index) => (
                      <option value={index + 1} key={index}>
                        {index + 1}번째 문단 ·{' '}
                        {paragraph.length > 30
                          ? paragraph.slice(0, 30) + '…'
                          : paragraph}
                      </option>
                    ))}
                  </select>
                  <p id="sticker-paragraph-help" className="field-help">
                    입력이 확인된 본문 문단만 위치 기준으로 사용합니다.
                  </p>
                </div>

                <fieldset
                  className="divider-position-fieldset"
                  disabled={
                    isUiBusy ||
                    Boolean(stickerResult) ||
                    stickerRetryBlocked
                  }
                  aria-describedby="sticker-position-help"
                >
                  <legend className="field-label">
                    삽입 위치 <span>필수</span>
                  </legend>
                  <div className="divider-position-options">
                    {stickerPositionOptions.map((option) => (
                      <label
                        className={
                          'divider-position-option' +
                          (stickerPosition === option.value
                            ? ' is-selected'
                            : '')
                        }
                        key={option.value}
                      >
                        <input
                          type="radio"
                          name="sticker-position"
                          value={option.value}
                          checked={stickerPosition === option.value}
                          onChange={() => {
                            setStickerPosition(option.value);
                            setStickerCategories([]);
                            setStickerCategoryId('');
                            setError(null);
                          }}
                        />
                        <span>
                          <strong>{option.label}</strong>
                          <small>{option.description}</small>
                        </span>
                        {stickerPosition === option.value ? (
                          <Check aria-hidden="true" />
                        ) : null}
                      </label>
                    ))}
                  </div>
                  <p id="sticker-position-help" className="layout-selection-help">
                    위치를 바꾸면 현재 묶음 목록을 다시 불러옵니다.
                  </p>
                </fieldset>
              </div>

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
                  선택한 묶음 안에서 한 개만 무작위로 고릅니다. 본문 원문과 스티커 개수, 실제 순서를 다시 확인하며 항목을 확실히 식별하지 못하면 작업을 멈춥니다.
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
                    : '무작위 스티커 삽입'}
              </button>
            </div>

            <aside
              className="divider-test-summary"
              aria-label="스티커 묶음·무작위 삽입 테스트 범위"
            >
              <Sticker aria-hidden="true" />
              <div>
                <h3>
                  {stickerResult ? '처리 결과' : '이번 단계에서 확인할 내용'}
                </h3>
                {stickerResult ? (
                  <dl className="editor-result-values">
                    <div>
                      <dt>기준</dt>
                      <dd>{stickerResult.paragraphNumber}번째 문단</dd>
                    </div>
                    <div>
                      <dt>위치</dt>
                      <dd>{getStickerPositionLabel(stickerResult.position)}</dd>
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
                      <dd>{stickerResult.stickerCount}개</dd>
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
      ) : null}      {stickerResult ? (
        <section
          className="divider-test-panel quote-test-panel"
          aria-labelledby="quote-test-heading"
          aria-busy={
            activeAction === 'quote-styles' ||
            activeAction === 'quote'
          }
        >
          <header className="panel-heading">
            <div>
              <h2 id="quote-test-heading">인용구 위치·디자인 테스트</h2>
              <p>
                본문 위치와 디자인을 하나씩 선택해 네이버 편집기에 인용구를 넣습니다.
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
              <div className="divider-location-grid">
                <div className="field-group">
                  <label htmlFor="quote-paragraph">
                    기준 문단 <span>필수</span>
                  </label>
                  <select
                    id="quote-paragraph"
                    value={quoteParagraphNumber}
                    disabled={
                      isUiBusy ||
                      Boolean(quoteResult) ||
                      quoteRetryBlocked
                    }
                    aria-describedby="quote-paragraph-help"
                    onChange={(event) => {
                      setQuoteParagraphNumber(Number(event.target.value));
                      setQuoteStyles([]);
                      setQuoteStyleSelection('random');
                      setQuoteResult(null);
                      setDraftSaveResult(null);
                      setError(null);
                    }}
                  >
                    {draftParagraphs.map((paragraph, index) => (
                      <option value={index + 1} key={index}>
                        {index + 1}번째 문단 ·{' '}
                        {paragraph.length > 30
                          ? `${paragraph.slice(0, 30)}…`
                          : paragraph}
                      </option>
                    ))}
                  </select>
                  <p id="quote-paragraph-help" className="field-help">
                    이번 기술검증에서는 입력이 확인된 본문 문단만 위치 기준으로 사용합니다.
                  </p>
                </div>

                <fieldset
                  className="divider-position-fieldset"
                  disabled={
                    isUiBusy ||
                    Boolean(quoteResult) ||
                    quoteRetryBlocked
                  }
                  aria-describedby="quote-position-help"
                >
                  <legend className="field-label">
                    삽입 위치 <span>필수</span>
                  </legend>
                  <div className="divider-position-options">
                    {quotePositionOptions.map((option) => (
                      <label
                        className={`divider-position-option${
                          quotePosition === option.value
                            ? ' is-selected'
                            : ''
                        }`}
                        key={option.value}
                      >
                        <input
                          type="radio"
                          name="quote-position"
                          value={option.value}
                          checked={quotePosition === option.value}
                          onChange={() => {
                            setQuotePosition(option.value);
                            setQuoteStyles([]);
                            setQuoteStyleSelection('random');
                            setQuoteResult(null);
                            setDraftSaveResult(null);
                            setError(null);
                          }}
                        />
                        <span>
                          <strong>{option.label}</strong>
                          <small>{option.description}</small>
                        </span>
                        {quotePosition === option.value ? (
                          <Check aria-hidden="true" />
                        ) : null}
                      </label>
                    ))}
                  </div>
                  <p id="quote-position-help" className="layout-selection-help">
                    위치를 바꾸면 현재 디자인 목록을 다시 불러옵니다.
                  </p>
                </fieldset>
              </div>

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
                  quoteStyles.length === 0 ||
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
                    : '인용구 삽입'}
              </button>
            </div>

            <aside
              className="divider-test-summary"
              aria-label="인용구 위치·디자인 테스트 범위"
            >
              <Quote aria-hidden="true" />
              <div>
                <h3>
                  {quoteResult ? '처리 결과' : '이번 단계에서 확인할 내용'}
                </h3>
                {quoteResult ? (
                  <dl className="editor-result-values">
                    <div>
                      <dt>기준</dt>
                      <dd>{quoteResult.paragraphNumber}번째 문단</dd>
                    </div>
                    <div>
                      <dt>위치</dt>
                      <dd>{getQuotePositionLabel(quoteResult.position)}</dd>
                    </div>
                    <div>
                      <dt>디자인</dt>
                      <dd>{quoteResult.styleLabel ?? '기본 인용구'}</dd>
                    </div>
                    <div>
                      <dt>인용구</dt>
                      <dd>{quoteResult.quoteCount}개</dd>
                    </div>
                  </dl>
                ) : (
                  <ol>
                    <li>본문 문단이 입력 원문과 같은지 확인</li>
                    <li>선택한 문단의 시작 또는 끝에 커서 지정</li>
                    <li>현재 네이버 편집기의 인용구 디자인 목록 확인</li>
                    <li>무작위 또는 선택한 디자인 한 개만 조작</li>
                    <li>디자인·삽입 개수·문단 앞뒤 순서를 재확인</li>
                  </ol>
                )}
              </div>
            </aside>
          </div>
        </section>
      ) : null}
    </>
  );
}

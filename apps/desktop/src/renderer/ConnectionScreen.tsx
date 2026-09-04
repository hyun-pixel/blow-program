import {
  Check,
  CheckCircle2,
  Circle,
  ExternalLink,
  FileText,
  Keyboard,
  Link2,
  LoaderCircle,
  LogIn,
  MousePointerClick,
  PanelsTopLeft,
  ShieldCheck,
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
  NaverEditorInputResult,
} from '@blow/naver-adapter';

type StepStatus = 'complete' | 'current' | 'pending' | 'failed';

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
  const [activeAction, setActiveAction] = useState<
    'open' | 'verify' | 'writer' | 'input' | 'focus' | null
  >(null);
  const [error, setError] = useState<{
    code: string;
    message: string;
  } | null>(null);

  const isRunning = activeAction !== null;
  const isAutoChecking =
    browserOpen &&
    !error &&
    (status?.stage === 'LOGIN_REQUIRED' || status?.stage === 'HOME_READY');
  const fieldError = error?.code === 'INVALID_BLOG_URL'
    ? error.message
    : null;

  useEffect(() => {
    if (fieldError) {
      blogUrlInputRef.current?.focus();
    }
  }, [fieldError]);

  useEffect(() => {
    return window.blowNaver.onState((response) => {
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
    setActiveAction(action);
    setError(null);

    try {
      const response = await command();

      if (response.ok) {
        setStatus(response.status);

        if (action === 'open') {
          setBrowserOpen(true);
        }

        if (action === 'open' || action === 'writer') {
          setInputResult(null);
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
      setError({
        code: 'NAVER_CONNECTION_FAILED',
        message: '네이버 연결 상태를 확인하지 못했습니다. 다시 시도해 주세요.',
      });
    } finally {
      setActiveAction(null);
    }
  };

  const submitConnection = (): void => {
    if (!browserOpen) {
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
    setActiveAction('focus');

    try {
      const response = await window.blowNaver.focus();

      if (!response.ok) {
        setError(response.error);
      }
    } catch {
      setError({
        code: 'NAVER_CONNECTION_FAILED',
        message: '전용 Chrome 창을 찾지 못했습니다.',
      });
    } finally {
      setActiveAction(null);
    }
  };

  const closeChrome = async (): Promise<void> => {
    setActiveAction('focus');

    try {
      await window.blowNaver.close();
      setBrowserOpen(false);
      setStatus(null);
      setInputResult(null);
      setDraftErrors({ title: '', body: '' });
      setError(null);
    } finally {
      setActiveAction(null);
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

    setActiveAction('input');
    setInputResult(null);
    setError(null);

    try {
      const response = await window.blowNaver.enterContent({
        title,
        paragraphs,
      });

      if (response.ok) {
        setInputResult(response.result);
      } else {
        setError(response.error);
      }
    } catch {
      setError({
        code: 'NAVER_CONNECTION_FAILED',
        message: '제목과 본문 입력을 완료하지 못했습니다. Chrome 화면을 확인해 주세요.',
      });
    } finally {
      setActiveAction(null);
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
  const editorError = error
    ? [
        'INVALID_DRAFT_CONTENT',
        'EDITOR_NOT_READY',
        'EDITOR_FIELD_AMBIGUOUS',
        'EDITOR_NOT_BLANK',
        'EDITOR_INPUT_MISMATCH',
      ].includes(error.code)
    : false;

  return (
    <>
      <header className="page-head">
        <div>
          <h1>네이버 자동 입력 확인</h1>
          <p>
            등록 블로그를 연결한 뒤 네이버 편집기에 제목과 본문을 안전하게 입력합니다.
          </p>
        </div>
        {browserOpen ? (
          <div className="page-head-actions">
            <button
              className="button secondary"
              type="button"
              disabled={isRunning}
              onClick={() => void focusChrome()}
            >
              <ExternalLink aria-hidden="true" />
              Chrome 보기
            </button>
            <button
              className="button tertiary"
              type="button"
              disabled={isRunning}
              onClick={() => void closeChrome()}
            >
              <X aria-hidden="true" />
              Chrome 닫기
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

      {error ? (
        <section className="message error-message" role="alert">
          <XCircle aria-hidden="true" />
          <div>
            <h2>
              {editorError
                ? '입력 상태를 확인해 주세요'
                : '연결 상태를 확인해 주세요'}
            </h2>
            <p>{error.message}</p>
          </div>
        </section>
      ) : null}

      {inputResult ? (
        <section className="message success-message" role="status">
          <CheckCircle2 aria-hidden="true" />
          <div>
            <h2>제목과 본문 입력을 확인했습니다</h2>
            <p>
              네이버 Chrome에서 내용을 검토해 주세요. 임시저장과 최종 발행은 실행하지 않았습니다.
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
        aria-busy={isRunning || isAutoChecking}
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
                isRunning ||
                isAutoChecking ||
                status?.stage === 'WRITER_READY'
              }
            >
              {isRunning || isAutoChecking ? (
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
            ) : isRunning || isAutoChecking ? (
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
                  BLOW는 임시저장과 최종 발행을 누르지 않습니다. 입력값은 디스크에 저장하지 않지만,
                  네이버 편집기가 자동 복구용 내용을 남길 수 있습니다.
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
                disabled={isRunning || Boolean(inputResult)}
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
                <h3>{inputResult ? '검증 결과' : '이번 단계에서 확인할 내용'}</h3>
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
    </>
  );
}
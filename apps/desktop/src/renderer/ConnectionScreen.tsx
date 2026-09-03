import {
  Check,
  CheckCircle2,
  Circle,
  ExternalLink,
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
import type { NaverConnectionStatus } from '@blow/naver-adapter';

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

export function ConnectionScreen() {
  const [blogUrl, setBlogUrl] = useState('');
  const blogUrlInputRef = useRef<HTMLInputElement>(null);
  const [status, setStatus] = useState<NaverConnectionStatus | null>(null);
  const [browserOpen, setBrowserOpen] = useState(false);
  const [activeAction, setActiveAction] = useState<
    'open' | 'verify' | 'writer' | 'focus' | null
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
      setError(null);
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

  return (
    <>
      <header className="page-head">
        <div>
          <h1>네이버 연결 확인</h1>
          <p>
            전용 Chrome의 로그인 상태와 등록 블로그를 확인한 뒤 글쓰기 화면까지만 이동합니다.
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
            <h2>연결 상태를 확인해 주세요</h2>
            <p>{error.message}</p>
          </div>
        </section>
      ) : null}

      {status?.stage === 'WRITER_READY' ? (
        <section className="message success-message" role="status">
          <CheckCircle2 aria-hidden="true" />
          <div>
            <h2>글쓰기 화면 진입을 확인했습니다</h2>
            <p>
              내용 입력과 임시저장, 최종 발행은 실행하지 않았습니다.
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
    </>
  );
}

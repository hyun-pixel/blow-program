import {
  Building2,
  Check,
  CheckCircle2,
  Link2,
  LogOut,
  PanelsTopLeft,
  Circle,
  FileText,
  FilePenLine,
  KeyRound,
  LoaderCircle,
  Play,
  ShieldCheck,
  X,
  XCircle,
} from 'lucide-react';
import {
  useEffect,
  useMemo,
  useState,
} from 'react';
import {
  decideDeviceAccess,
  decideLicenseAccess,
  isVersionAtLeast,
  type LicenseAccessBlockReason,
  type PocSnapshot,
  type PocState,
} from '@blow/automation-core';
import type { Session } from '@supabase/supabase-js';
import { AuthScreen } from './AuthScreen.js';
import { BrandProfileScreen } from './BrandProfileScreen.js';
import { ConnectionScreen } from './ConnectionScreen.js';
import { OpenAiSettingsScreen } from './OpenAiSettingsScreen.js';
import { NewPostScreen } from './NewPostScreen.js';
import { supabase } from './supabase.js';
import type { GeneratedBlogImage } from '../main/openai-image-generation.js';

type Screen = 'newPost' | 'connection' | 'openai' | 'brand' | 'automation' | 'safety';
type StepStatus = 'complete' | 'current' | 'pending' | 'failed';

interface PreparedNaverDraft {
  readonly title: string;
  readonly body: string;
  readonly images: readonly GeneratedBlogImage[];
}

const initialSnapshot: PocSnapshot = {
  current: 'IDLE',
  isTerminal: false,
  history: [
    {
      state: 'IDLE',
      message: '테스트를 시작할 수 있습니다.',
      occurredAt: new Date().toISOString(),
    },
  ],
};

const stepDefinitions: ReadonlyArray<{
  state: PocState;
  label: string;
  description: string;
}> = [
  {
    state: 'PREFLIGHT',
    label: '실행 환경 확인',
    description: 'Chrome과 테스트 파일을 확인합니다.',
  },
  {
    state: 'OPEN_BROWSER',
    label: '전용 Chrome 실행',
    description: '일반 Chrome과 분리된 프로필을 엽니다.',
  },
  {
    state: 'EDITOR_READY',
    label: '편집기 확인',
    description: '제목과 본문 입력 영역을 찾습니다.',
  },
  {
    state: 'TITLE_INPUT',
    label: '제목 입력',
    description: '입력 후 원문과 다시 비교합니다.',
  },
  {
    state: 'BODY_INPUT',
    label: '본문 입력',
    description: '두 문단과 줄바꿈을 확인합니다.',
  },
  {
    state: 'TEMP_SAVE',
    label: '임시저장 실행',
    description: '허용된 저장 버튼만 누릅니다.',
  },
  {
    state: 'VERIFY_SAVE',
    label: '저장 상태 확인',
    description: '완료 문구를 다시 읽어 확인합니다.',
  },
];

const stateOrder: readonly PocState[] = [
  'IDLE',
  ...stepDefinitions.map((step) => step.state),
  'COMPLETED',
];

function getStepStatus(
  step: PocState,
  snapshot: PocSnapshot,
): StepStatus {
  const visited = new Set(snapshot.history.map((entry) => entry.state));

  if (snapshot.current === 'FAILED') {
    return visited.has(step) ? 'complete' : 'pending';
  }

  if (snapshot.current === step) {
    return 'current';
  }

  const currentIndex = stateOrder.indexOf(snapshot.current);
  const stepIndex = stateOrder.indexOf(step);

  if (visited.has(step) || currentIndex > stepIndex) {
    return 'complete';
  }

  return 'pending';
}

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

function AutomationScreen() {
  const [snapshot, setSnapshot] = useState<PocSnapshot>(initialSnapshot);
  const [isRunning, setIsRunning] = useState(false);
  const [browserOpen, setBrowserOpen] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [savedStatus, setSavedStatus] = useState<string | null>(null);

  useEffect(() => window.blowPoc.onState(setSnapshot), []);

  const latestEntry = snapshot.history.at(-1) ?? initialSnapshot.history[0];

  const completedStepCount = useMemo(
    () =>
      stepDefinitions.filter(
        (step) => getStepStatus(step.state, snapshot) === 'complete',
      ).length,
    [snapshot],
  );

  const startTest = async (): Promise<void> => {
    setIsRunning(true);
    setErrorMessage(null);
    setSavedStatus(null);

    const response = await window.blowPoc.start();

    if (response.ok) {
      setSnapshot(response.snapshot);
      setSavedStatus(response.verification.savedStatus);
      setBrowserOpen(true);
    } else {
      if (response.snapshot) {
        setSnapshot(response.snapshot);
      }

      setErrorMessage(response.error.message);
      setBrowserOpen(false);
    }

    setIsRunning(false);
  };

  const closeBrowser = async (): Promise<void> => {
    await window.blowPoc.closeBrowser();
    setBrowserOpen(false);
  };

  const currentStatus = errorMessage
    ? '확인 필요'
    : savedStatus
      ? '검증 완료'
      : isRunning
        ? '진행 중'
        : '시작 전';

  return (
    <>
      <header className="page-head">
        <div>
          <h1>자동 입력 기술검증</h1>
          <p>
            실제 네이버 연결 전에 전용 Chrome과 입력 순서를 로컬 화면에서 확인합니다.
          </p>
        </div>
        <div className="page-head-actions">
          {browserOpen ? (
            <button
              className="button secondary"
              type="button"
              onClick={closeBrowser}
            >
              <X aria-hidden="true" />
              Chrome 닫기
            </button>
          ) : null}
        </div>
      </header>

      <section className="status-strip" aria-label="기술검증 환경">
        <div className="status-item">
          <PanelsTopLeft aria-hidden="true" />
          <span>
            <strong>Chrome</strong>
            <small>전용 프로필</small>
          </span>
        </div>
        <div className="status-item">
          <FileText aria-hidden="true" />
          <span>
            <strong>입력 대상</strong>
            <small>로컬 가짜 편집기</small>
          </span>
        </div>
        <div className="status-item">
          {savedStatus ? (
            <CheckCircle2 aria-hidden="true" />
          ) : (
            <Circle aria-hidden="true" />
          )}
          <span>
            <strong>현재 결과</strong>
            <small>{currentStatus}</small>
          </span>
        </div>
      </section>

      {errorMessage ? (
        <section className="message error-message" role="alert">
          <XCircle aria-hidden="true" />
          <div>
            <h2>테스트를 완료하지 못했습니다</h2>
            <p>{errorMessage}</p>
          </div>
        </section>
      ) : null}

      {savedStatus ? (
        <section className="message success-message" role="status">
          <CheckCircle2 aria-hidden="true" />
          <div>
            <h2>가짜 편집기 검증을 완료했습니다</h2>
            <p>
              제목과 본문이 일치하고 {savedStatus} 상태를 확인했습니다.
            </p>
          </div>
        </section>
      ) : null}

      <section
        className="workbench"
        aria-busy={isRunning}
        aria-labelledby="sample-heading"
      >
        <div className="document-panel">
          <header className="panel-heading">
            <div>
              <h2 id="sample-heading">테스트 글</h2>
              <p>외부 서버로 보내지 않는 고정 예시입니다.</p>
            </div>
            <span className="document-state">두 문단</span>
          </header>

          <div className="document-section">
            <h3>제목</h3>
            <p className="sample-title">가을 웨딩 헤어를 준비하는 방법</p>
          </div>

          <div className="document-section">
            <h3>본문</h3>
            <div className="sample-body">
              <p>
                상담 전에 원하는 분위기와 예식 장소를 정리하면 헤어 방향을 더 빠르게 결정할 수 있습니다.
              </p>
              <p>
                얼굴형과 드레스 목선을 함께 살펴보고, 저장한 참고 이미지는 담당자에게 미리 전달해 주세요.
              </p>
            </div>
          </div>

          <div className="document-note">
            <ShieldCheck aria-hidden="true" />
            <p>
              테스트 페이지에는 최종 발행 버튼과 관련 동작이 없습니다.
            </p>
          </div>
        </div>

        <aside className="progress-panel" aria-labelledby="progress-heading">
          <header className="panel-heading compact">
            <div>
              <h2 id="progress-heading">실행 순서</h2>
              <p>
                {completedStepCount}개 완료, {stepDefinitions.length}개 확인
              </p>
            </div>
          </header>

          <div className="live-status" role="status" aria-live="polite">
            {snapshot.current === 'FAILED' ? (
              <XCircle aria-hidden="true" />
            ) : snapshot.current === 'COMPLETED' ? (
              <CheckCircle2 aria-hidden="true" />
            ) : isRunning ? (
              <LoaderCircle className="is-spinning" aria-hidden="true" />
            ) : (
              <Circle aria-hidden="true" />
            )}
            <span>
              <strong>{currentStatus}</strong>
              <small>{latestEntry?.message}</small>
            </span>
          </div>

          <ol className="step-list">
            {stepDefinitions.map((step) => {
              const status = getStepStatus(step.state, snapshot);

              return (
                <li
                  className={`step-row is-${status}`}
                  key={step.state}
                  aria-current={status === 'current' ? 'step' : undefined}
                >
                  <span className="step-icon">
                    <StepIcon status={status} />
                  </span>
                  <span className="step-copy">
                    <strong>{step.label}</strong>
                    <small>{step.description}</small>
                  </span>
                  <span className="step-state">
                    {status === 'complete'
                      ? '완료'
                      : status === 'current'
                        ? '진행 중'
                        : '대기'}
                  </span>
                </li>
              );
            })}
          </ol>
        </aside>

        <footer className="action-bar">
          <p>
            테스트는 개인 Chrome 프로필과 네이버 계정에 접근하지 않습니다.
          </p>
          <button
            className="button primary"
            type="button"
            disabled={isRunning}
            onClick={() => void startTest()}
          >
            {isRunning ? (
              <LoaderCircle className="is-spinning" aria-hidden="true" />
            ) : (
              <Play aria-hidden="true" />
            )}
            {isRunning ? '테스트 진행 중…' : '테스트 시작'}
          </button>
        </footer>
      </section>
    </>
  );
}

function SafetyScreen() {
  return (
    <>
      <header className="page-head">
        <div>
          <h1>안전 기준</h1>
          <p>
            실제 네이버 편집기 연결 전부터 지켜야 할 자동화 경계를 확인합니다.
          </p>
        </div>
      </header>

      <section className="safety-sheet">
        <div className="safety-section">
          <h2>Chrome 분리</h2>
          <p>
            BLOW 전용 프로필만 사용합니다. 평소 사용하는 Chrome 프로필은 읽거나 조작하지 않습니다.
          </p>
        </div>

        <div className="safety-section">
          <h2>클릭 전 확인</h2>
          <p>
            현재 주소, 화면 단계, 버튼 개수와 활성 상태를 모두 확인한 뒤에만 조작합니다.
          </p>
        </div>

        <div className="safety-section">
          <h2>불확실하면 중단</h2>
          <p>
            버튼을 찾지 못하거나 두 개 이상 발견하면 임의로 선택하지 않고 작업을 멈춥니다.
          </p>
        </div>

        <div className="safety-section">
          <h2>임시저장까지만</h2>
          <p>
            자동화 명령과 선택자 목록에는 최종 발행 기능을 만들지 않습니다.
          </p>
        </div>

        <div className="safety-section">
          <h2>콘텐츠 비수집</h2>
          <p>
            API 키, 네이버 로그인 정보, 제목, 본문과 이미지는 BLOW 서버로 보내지 않습니다.
          </p>
        </div>
      </section>
    </>
  );
}

function formatLicenseEndDate(value: string): string {
  return new Intl.DateTimeFormat('ko-KR', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  }).format(new Date(value));
}

function Workspace({
  session,
  licenseEndsAt,
}: {
  readonly session: Session;
  readonly licenseEndsAt: string;
}) {
  const [screen, setScreen] = useState<Screen>('newPost');
  const [preparedNaverDraft, setPreparedNaverDraft] =
    useState<PreparedNaverDraft | null>(null);
  const [isSigningOut, setIsSigningOut] = useState(false);
  const [signOutError, setSignOutError] = useState<string | null>(null);

  const signOut = async (): Promise<void> => {
    if (!supabase) {
      return;
    }

    setIsSigningOut(true);
    setSignOutError(null);
    const { error } = await supabase.auth.signOut();

    if (error) {
      setSignOutError('로그아웃하지 못했습니다. 다시 시도해 주세요.');
    }

    setIsSigningOut(false);
  };

  return (
    <div className="app">
      <a className="skip-link" href="#main-content">
        본문으로 건너뛰기
      </a>

      <header className="titlebar">
        <div className="wordmark">
          <span className="wordmark-sign" aria-hidden="true">
            B
          </span>
          <span>BLOW</span>
        </div>
        <div className="titlebar-meta">
          <span>계정 연결됨</span>
          <strong>로컬 개발 모드</strong>
        </div>
      </header>

      <div className="shell">
        <aside className="sidebar" aria-label="주요 메뉴">
          <nav>
            <button
              className={screen === 'newPost' ? 'nav-button is-active' : 'nav-button'}
              type="button"
              aria-current={screen === 'newPost' ? 'page' : undefined}
              onClick={() => setScreen('newPost')}
            >
              <FilePenLine aria-hidden="true" />
              새 글 작성
            </button>
            <button
              className={screen === 'connection' ? 'nav-button is-active' : 'nav-button'}
              type="button"
              aria-current={screen === 'connection' ? 'page' : undefined}
              onClick={() => setScreen('connection')}
            >
              <Link2 aria-hidden="true" />
              네이버 연결
            </button>
            <button
              className={screen === 'openai' ? 'nav-button is-active' : 'nav-button'}
              type="button"
              aria-current={screen === 'openai' ? 'page' : undefined}
              onClick={() => setScreen('openai')}
            >
              <KeyRound aria-hidden="true" />
              OpenAI 연결
            </button>
            <button
              className={screen === 'brand' ? 'nav-button is-active' : 'nav-button'}
              type="button"
              aria-current={screen === 'brand' ? 'page' : undefined}
              onClick={() => setScreen('brand')}
            >
              <Building2 aria-hidden="true" />
              브랜드 프로필
            </button>
            <button
              className={screen === 'automation' ? 'nav-button is-active' : 'nav-button'}
              type="button"
              aria-current={screen === 'automation' ? 'page' : undefined}
              onClick={() => setScreen('automation')}
            >
              <PanelsTopLeft aria-hidden="true" />
              자동 입력
            </button>
            <button
              className={screen === 'safety' ? 'nav-button is-active' : 'nav-button'}
              type="button"
              aria-current={screen === 'safety' ? 'page' : undefined}
              onClick={() => setScreen('safety')}
            >
              <ShieldCheck aria-hidden="true" />
              안전 기준
            </button>
          </nav>

          <div className="sidebar-account">
            <span className="sidebar-account-label">로그인 계정</span>
            <strong title={session.user.email}>
              {session.user.email ?? '이메일 확인 불가'}
            </strong>
            {signOutError ? (
              <span className="sidebar-account-error" role="alert">
                {signOutError}
              </span>
            ) : (
              <span>이용 종료 {formatLicenseEndDate(licenseEndsAt)}</span>
            )}
            <button
              type="button"
              disabled={isSigningOut}
              onClick={() => void signOut()}
            >
              {isSigningOut ? (
                <LoaderCircle className="is-spinning" aria-hidden="true" />
              ) : (
                <LogOut aria-hidden="true" />
              )}
              {isSigningOut ? '로그아웃 중…' : '로그아웃'}
            </button>
          </div>
        </aside>

        <main id="main-content" className="main" tabIndex={-1}>
          {screen === 'newPost' ? (
            <NewPostScreen
              userId={session.user.id}
              onOpenBrandProfile={() => setScreen('brand')}
              onPrepareNaverDraft={(draft) => {
                setPreparedNaverDraft(draft);
                setScreen('connection');
              }}
            />
          ) : screen === 'connection' ? (
            <ConnectionScreen initialDraft={preparedNaverDraft ?? undefined} />
          ) : screen === 'openai' ? (
            <OpenAiSettingsScreen />
          ) : screen === 'brand' ? (
            <BrandProfileScreen userId={session.user.id} />
          ) : screen === 'automation' ? (
            <AutomationScreen />
          ) : (
            <SafetyScreen />
          )}
        </main>
      </div>
    </div>
  );
}

type AccountStatus =
  | 'checking'
  | 'active'
  | 'suspended'
  | 'unverified'
  | 'unavailable'
  | 'license_inactive'
  | 'license_invalid'
  | 'license_not_started'
  | 'license_expired'
  | 'device_unavailable'
  | 'device_mismatch'
  | 'update_required'
  | 'automation_disabled';

function getBlockedLicenseStatus(
  reason: LicenseAccessBlockReason,
): Exclude<AccountStatus, 'checking' | 'active'> {
  const statuses: Readonly<
    Record<
      LicenseAccessBlockReason,
      Exclude<AccountStatus, 'checking' | 'active'>
    >
  > = {
    LICENSE_INACTIVE: 'license_inactive',
    LICENSE_INVALID: 'license_invalid',
    LICENSE_NOT_STARTED: 'license_not_started',
    LICENSE_EXPIRED: 'license_expired',
  };

  return statuses[reason];
}

function AccountStatusScreen({
  status,
  onRetry,
  onSignOut,
}: {
  readonly status: Exclude<AccountStatus, 'active'>;
  readonly onRetry: () => void;
  readonly onSignOut: () => void;
}) {
  const content = {
    checking: {
      title: '계정 확인 중',
      description: '로그인 상태와 회원 정보를 안전하게 확인하고 있습니다.',
    },
    suspended: {
      title: '사용이 중지된 계정입니다',
      description: '계정 상태를 확인하려면 관리자에게 문의해 주세요.',
    },
    unverified: {
      title: '이메일 인증이 필요합니다',
      description: '받은 메일에서 인증을 완료한 뒤 다시 확인해 주세요.',
    },
    unavailable: {
      title: '계정 정보를 확인하지 못했습니다',
      description: '네트워크 연결을 확인한 뒤 다시 시도해 주세요.',
    },
    license_inactive: {
      title: '이용권이 준비되지 않았습니다',
      description: '관리자가 베타 이용권을 등록한 뒤 다시 확인해 주세요.',
    },
    license_invalid: {
      title: '이용권 정보를 확인해 주세요',
      description: '등록된 이용 기간에 문제가 있습니다. 관리자에게 문의해 주세요.',
    },
    license_not_started: {
      title: '아직 이용 기간이 시작되지 않았습니다',
      description: '이용 시작일이 지난 뒤 다시 확인해 주세요.',
    },
    license_expired: {
      title: '이용 기간이 종료되었습니다',
      description: '계속 사용하려면 이용권 갱신이 필요합니다.',
    },
    device_unavailable: {
      title: '기기를 확인하지 못했습니다',
      description: '프로그램을 다시 시작한 뒤 재시도해 주세요.',
    },
    device_mismatch: {
      title: '등록되지 않은 기기입니다',
      description:
        '이 계정은 처음 등록한 Windows PC에서만 사용할 수 있습니다. 기기를 변경하려면 관리자에게 문의해 주세요.',
    },
    update_required: {
      title: '프로그램 업데이트가 필요합니다',
      description: '관리자에게 최신 BLOW 설치 파일을 요청해 주세요.',
    },
    automation_disabled: {
      title: '자동 입력이 일시 중지되었습니다',
      description: '안전 점검이 끝난 뒤 다시 확인해 주세요.',
    },
  }[status];

  return (
    <main className="auth-page">
      <section className="auth-card" aria-labelledby="account-status-heading">
        <div className="auth-brand" aria-label="BLOW">
          <span className="wordmark-sign" aria-hidden="true">
            B
          </span>
          <strong>BLOW</strong>
        </div>
        <header className="auth-heading">
          <h1 id="account-status-heading">{content.title}</h1>
          <p>{content.description}</p>
        </header>
        {status === 'checking' ? (
          <div className="account-checking" role="status">
            <LoaderCircle className="is-spinning" aria-hidden="true" />
            서버 응답을 기다리고 있습니다.
          </div>
        ) : (
          <div className="auth-actions">
            <button className="button primary" type="button" onClick={onRetry}>
              다시 확인
            </button>
            <button className="button secondary" type="button" onClick={onSignOut}>
              로그아웃
            </button>
          </div>
        )}
      </section>
    </main>
  );
}

export function App() {
  const [session, setSession] = useState<Session | null | undefined>(undefined);
  const [accountStatus, setAccountStatus] =
    useState<AccountStatus>('checking');
  const [licenseEndsAt, setLicenseEndsAt] = useState<string | null>(null);
  const [checkVersion, setCheckVersion] = useState(0);
  const userId = session?.user.id;
  const emailConfirmedAt = session?.user.email_confirmed_at;

  useEffect(() => {
    const client = supabase;

    if (!client) {
      setSession(null);
      return;
    }

    let active = true;

    void client.auth.getSession().then(({ data }) => {
      if (active) {
        setSession(data.session);
      }
    });

    const {
      data: { subscription },
    } = client.auth.onAuthStateChange((_event, nextSession) => {
      if (active) {
        setSession(nextSession);
      }
    });

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    const client = supabase;

    if (!client || !userId) {
      setAccountStatus('checking');
      return;
    }

    if (!emailConfirmedAt) {
      setAccountStatus('unverified');
      return;
    }

    let active = true;
    setAccountStatus('checking');
    setLicenseEndsAt(null);

    void Promise.all([
      client
        .from('profiles')
        .select('account_status')
        .eq('id', userId)
        .single(),
      client
        .from('licenses')
        .select('status, starts_at, ends_at')
        .eq('user_id', userId)
        .maybeSingle(),
      client
        .from('device_registrations')
        .select('device_hash')
        .eq('user_id', userId)
        .maybeSingle(),
      client
        .from('app_controls')
        .select('minimum_version, automation_enabled')
        .eq('id', true)
        .single(),
      window.blowSystem.getAppVersion(),
      window.blowSystem.getDeviceHash(),
    ]).then(async ([
      profileResult,
      licenseResult,
      deviceResult,
      controlsResult,
      appVersion,
      currentDeviceHash,
    ]) => {
      if (!active) {
        return;
      }

      if (
        profileResult.error ||
        licenseResult.error ||
        deviceResult.error ||
        controlsResult.error ||
        !controlsResult.data ||
        !profileResult.data
      ) {
        setAccountStatus('unavailable');
        return;
      }

      if (profileResult.data.account_status !== 'active') {
        setAccountStatus('suspended');
        return;
      }

      if (
        !isVersionAtLeast(
          appVersion,
          controlsResult.data.minimum_version,
        )
      ) {
        setAccountStatus('update_required');
        return;
      }

      if (!controlsResult.data.automation_enabled) {
        setAccountStatus('automation_disabled');
        return;
      }

      const license = licenseResult.data;
      const decision = decideLicenseAccess({
        status: license?.status === 'active' ? 'active' : 'inactive',
        startsAt: license?.starts_at ?? '',
        endsAt: license?.ends_at ?? '',
        now: new Date().toISOString(),
      });

      if (decision.allowed) {
        let registeredDeviceHash = deviceResult.data?.device_hash ?? null;

        if (!registeredDeviceHash) {
          const registrationResult = await client.rpc('register_device', {
            requested_device_hash: currentDeviceHash,
          });

          if (!active) {
            return;
          }

          if (
            registrationResult.error ||
            typeof registrationResult.data !== 'string'
          ) {
            setAccountStatus('device_unavailable');
            return;
          }

          registeredDeviceHash = registrationResult.data;
        }

        const deviceDecision = decideDeviceAccess({
          registeredDeviceHash,
          currentDeviceHash,
        });

        if (!deviceDecision.allowed) {
          setAccountStatus(
            deviceDecision.reason === 'DEVICE_MISMATCH'
              ? 'device_mismatch'
              : 'device_unavailable',
          );
          return;
        }

        setLicenseEndsAt(decision.expiresAt);
        setAccountStatus('active');
        return;
      }

      setAccountStatus(getBlockedLicenseStatus(decision.reason));
    }).catch(() => {
      if (active) {
        setAccountStatus('unavailable');
      }
    });

    return () => {
      active = false;
    };
  }, [checkVersion, emailConfirmedAt, userId]);

  useEffect(() => {
    const client = supabase;

    if (!client || !userId) {
      return;
    }

    const refreshAccess = (): void => {
      void window.blowNaver.close().catch(() => undefined);
      setCheckVersion((current) => current + 1);
    };

    const channel = client
      .channel(`account-controls:${userId}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'app_controls' },
        refreshAccess,
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'profiles',
          filter: `id=eq.${userId}`,
        },
        refreshAccess,
      )
      .subscribe();

    return () => {
      void client.removeChannel(channel);
    };
  }, [userId]);

  const signOut = (): void => {
    void supabase?.auth.signOut();
  };

  if (!supabase || session === null) {
    return <AuthScreen />;
  }

  if (
    session === undefined ||
    accountStatus !== 'active' ||
    !licenseEndsAt
  ) {
    let screenStatus: Exclude<AccountStatus, 'active'> = 'checking';

    if (session !== undefined && accountStatus !== 'active') {
      screenStatus = accountStatus;
    }

    return (
      <AccountStatusScreen
        status={screenStatus}
        onRetry={() => setCheckVersion((current) => current + 1)}
        onSignOut={signOut}
      />
    );
  }

  return <Workspace session={session} licenseEndsAt={licenseEndsAt} />;
}

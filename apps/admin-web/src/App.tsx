import {
  AlertCircle,
  Check,
  CheckCircle2,
  Eye,
  EyeOff,
  LayoutDashboard,
  LoaderCircle,
  LockKeyhole,
  LogOut,
  ShieldCheck,
  UserCheck,
  Users,
} from 'lucide-react';
import type { Session } from '@supabase/supabase-js';
import { type FormEvent, type ReactNode, useEffect, useRef, useState } from 'react';
import { decideAdminAccess, type AdminAccessStage } from './admin-access.js';
import { MembersScreen } from './MembersScreen.js';
import { supabase } from './supabase.js';

type AccessView = 'loading' | AdminAccessStage | 'error';

type Enrollment = {
  readonly factorId: string;
  readonly qrCode: string;
  readonly secret: string;
};

function getSafeErrorMessage(context: 'login' | 'mfa' | 'access'): string {
  if (context === 'login') {
    return '이메일과 비밀번호를 확인한 뒤 다시 로그인해 주세요.';
  }

  if (context === 'mfa') {
    return '인증 코드가 올바른지 확인한 뒤 다시 시도해 주세요.';
  }

  return '관리자 보안 상태를 확인하지 못했습니다. 잠시 후 다시 시도해 주세요.';
}

function Message({ title, children }: { readonly title: string; readonly children: ReactNode }) {
  return (
    <div className="message error-message" role="alert" tabIndex={-1}>
      <AlertCircle aria-hidden="true" />
      <div>
        <h2>{title}</h2>
        <p>{children}</p>
      </div>
    </div>
  );
}

function LoadingCard({ label }: { readonly label: string }) {
  return (
    <main id="main-content" className="center-page">
      <section className="access-card compact-card" aria-live="polite">
        <LoaderCircle className="is-spinning" aria-hidden="true" />
        <div>
          <h1>관리자 보안 확인</h1>
          <p>{label}</p>
        </div>
      </section>
    </main>
  );
}

function LoginScreen() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const errorRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (errorMessage) errorRef.current?.focus();
  }, [errorMessage]);

  const submit = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    setErrorMessage(null);

    if (!supabase) {
      setErrorMessage('Supabase 공개 연결값을 확인해 주세요.');
      return;
    }

    setIsSubmitting(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });

    if (error) setErrorMessage(getSafeErrorMessage('login'));

    setPassword('');
    setIsSubmitting(false);
  };

  return (
    <main id="main-content" className="login-page">
      <section className="login-card" aria-labelledby="login-heading">
        <div className="brand" aria-label="BLOW 관리자">
          <span className="brand-sign" aria-hidden="true">B</span>
          <span><strong>BLOW</strong><small>관리자</small></span>
        </div>

        <header className="card-heading">
          <h1 id="login-heading">관리자 로그인</h1>
          <p>관리자 권한이 등록된 BLOW 계정으로 로그인해 주세요.</p>
        </header>

        {errorMessage ? (
          <div ref={errorRef} tabIndex={-1}>
            <Message title="로그인하지 못했습니다">{errorMessage}</Message>
          </div>
        ) : null}

        <form className="form" onSubmit={(event) => void submit(event)}>
          <div className="field-group">
            <label htmlFor="admin-email">이메일 <span className="required-label">필수</span></label>
            <input
              id="admin-email"
              type="email"
              autoComplete="email"
              value={email}
              disabled={isSubmitting}
              required
              onChange={(event) => setEmail(event.target.value)}
            />
          </div>

          <div className="field-group">
            <label htmlFor="admin-password">비밀번호 <span className="required-label">필수</span></label>
            <div className="password-control">
              <input
                id="admin-password"
                type={showPassword ? 'text' : 'password'}
                autoComplete="current-password"
                value={password}
                disabled={isSubmitting}
                required
                onChange={(event) => setPassword(event.target.value)}
              />
              <button
                type="button"
                aria-label={showPassword ? '비밀번호 숨기기' : '비밀번호 표시'}
                aria-pressed={showPassword}
                disabled={isSubmitting}
                onClick={() => setShowPassword((current) => !current)}
              >
                {showPassword ? <EyeOff aria-hidden="true" /> : <Eye aria-hidden="true" />}
              </button>
            </div>
          </div>

          <button className="button primary full-width" type="submit" disabled={isSubmitting}>
            {isSubmitting ? <LoaderCircle className="is-spinning" aria-hidden="true" /> : null}
            {isSubmitting ? '로그인 중…' : '로그인'}
          </button>
        </form>

        <div className="security-note">
          <ShieldCheck aria-hidden="true" />
          <p>관리자 기능은 로그인 후 Google Authenticator 인증까지 완료해야 열립니다.</p>
        </div>
      </section>
    </main>
  );
}

function MfaPanel({ session, onSignedOut }: { readonly session: Session; readonly onSignedOut: () => void }) {
  const [view, setView] = useState<AccessView>('loading');
  const [factorId, setFactorId] = useState<string | null>(null);
  const [enrollment, setEnrollment] = useState<Enrollment | null>(null);
  const [code, setCode] = useState('');
  const [showSecret, setShowSecret] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [auditCount, setAuditCount] = useState<number | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let cancelled = false;

    const loadAccess = async (): Promise<void> => {
      if (!supabase) return;

      setView('loading');
      setErrorMessage(null);

      const { data: admin, error: adminError } = await supabase
        .from('admin_users')
        .select('user_id')
        .eq('user_id', session.user.id)
        .maybeSingle();

      if (cancelled) return;

      if (adminError) {
        setErrorMessage(getSafeErrorMessage('access'));
        setView('error');
        return;
      }

      if (!admin) {
        setView('denied');
        return;
      }

      const [aalResponse, factorsResponse] = await Promise.all([
        supabase.auth.mfa.getAuthenticatorAssuranceLevel(),
        supabase.auth.mfa.listFactors(),
      ]);

      if (cancelled) return;

      if (aalResponse.error || factorsResponse.error) {
        setErrorMessage(getSafeErrorMessage('access'));
        setView('error');
        return;
      }

      const verifiedFactor = factorsResponse.data.totp[0] ?? null;
      setFactorId(verifiedFactor?.id ?? null);

      const nextView = decideAdminAccess({
        isAdmin: true,
        currentLevel: aalResponse.data.currentLevel,
        hasVerifiedTotp: Boolean(verifiedFactor),
      });

      if (nextView !== 'ready') {
        setView(nextView);
        return;
      }

      const { count, error: auditError } = await supabase
        .from('admin_audit_logs')
        .select('id', { count: 'exact', head: true });

      if (cancelled) return;

      if (auditError) {
        setErrorMessage('추가 인증은 완료됐지만 감사 기록 권한을 확인하지 못했습니다.');
        setView('error');
        return;
      }

      setAuditCount(count ?? 0);
      setView('ready');
    };

    void loadAccess();
    return () => { cancelled = true; };
  }, [reloadKey, session.user.id]);

  const signOut = async (): Promise<void> => {
    if (supabase) await supabase.auth.signOut();
    onSignedOut();
  };

  const beginEnrollment = async (): Promise<void> => {
    if (!supabase) return;

    setIsSubmitting(true);
    setErrorMessage(null);
    const factorsResponse = await supabase.auth.mfa.listFactors();

    if (factorsResponse.error) {
      setErrorMessage(getSafeErrorMessage('access'));
      setIsSubmitting(false);
      return;
    }

    const staleFactors = factorsResponse.data.all.filter(
      (factor) => factor.factor_type === 'totp' && factor.status === 'unverified',
    );

    for (const factor of staleFactors) {
      const { error } = await supabase.auth.mfa.unenroll({ factorId: factor.id });
      if (error) {
        setErrorMessage(getSafeErrorMessage('access'));
        setIsSubmitting(false);
        return;
      }
    }

    const { data, error } = await supabase.auth.mfa.enroll({
      factorType: 'totp',
      friendlyName: 'BLOW 관리자 인증',
      issuer: 'BLOW',
    });

    if (error) {
      setErrorMessage(getSafeErrorMessage('access'));
    } else {
      setEnrollment({ factorId: data.id, qrCode: data.totp.qr_code, secret: data.totp.secret });
      setCode('');
    }

    setIsSubmitting(false);
  };

  const verify = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    if (!supabase) return;

    const targetFactorId = enrollment?.factorId ?? factorId;
    if (!targetFactorId || code.length !== 6) {
      setErrorMessage('Google Authenticator의 6자리 코드를 입력해 주세요.');
      return;
    }

    setIsSubmitting(true);
    setErrorMessage(null);
    const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId: targetFactorId, code });

    if (error) {
      setErrorMessage(getSafeErrorMessage('mfa'));
      setIsSubmitting(false);
      return;
    }

    setCode('');
    setEnrollment(null);
    setIsSubmitting(false);
    setReloadKey((current) => current + 1);
  };

  if (view === 'loading') {
    return <LoadingCard label="관리자 권한과 추가 인증 상태를 확인하고 있습니다." />;
  }

  if (view === 'denied') {
    return (
      <main id="main-content" className="center-page">
        <section className="access-card" aria-labelledby="denied-heading">
          <UserCheck aria-hidden="true" />
          <header className="card-heading">
            <h1 id="denied-heading">관리자 권한이 없습니다</h1>
            <p>로그인은 완료됐지만 이 계정에는 BLOW 관리자 역할이 등록되어 있지 않습니다.</p>
          </header>
          <button className="button secondary" type="button" onClick={() => void signOut()}>
            <LogOut aria-hidden="true" />로그아웃
          </button>
        </section>
      </main>
    );
  }

  if (view === 'error') {
    return (
      <main id="main-content" className="center-page">
        <section className="access-card">
          <Message title="보안 확인을 완료하지 못했습니다">
            {errorMessage ?? getSafeErrorMessage('access')}
          </Message>
          <div className="button-row">
            <button className="button primary" type="button" onClick={() => setReloadKey((current) => current + 1)}>다시 확인</button>
            <button className="button secondary" type="button" onClick={() => void signOut()}>로그아웃</button>
          </div>
        </section>
      </main>
    );
  }

  if (view === 'enroll') {
    const qrSource = enrollment
      ? enrollment.qrCode.startsWith('data:')
        ? enrollment.qrCode
        : `data:image/svg+xml;utf8,${encodeURIComponent(enrollment.qrCode)}`
      : null;

    return (
      <main id="main-content" className="center-page">
        <section className="access-card" aria-labelledby="enroll-heading">
          <div className="step-label">관리자 보안 설정 · 1단계</div>
          <header className="card-heading">
            <h1 id="enroll-heading">Google Authenticator 등록</h1>
            <p>이 설정은 Supabase 관리 화면의 MFA와 별개이며, BLOW 관리자 접속에 사용됩니다.</p>
          </header>

          {errorMessage ? <Message title="등록을 완료하지 못했습니다">{errorMessage}</Message> : null}

          {!enrollment ? (
            <>
              <ol className="numbered-list">
                <li>휴대폰에서 Google Authenticator를 준비합니다.</li>
                <li>아래 버튼을 누르면 이 화면에 QR 코드가 표시됩니다.</li>
                <li>QR 코드를 스캔하고 생성된 6자리 코드를 입력합니다.</li>
              </ol>
              <button className="button primary" type="button" disabled={isSubmitting} onClick={() => void beginEnrollment()}>
                {isSubmitting ? <LoaderCircle className="is-spinning" aria-hidden="true" /> : <LockKeyhole aria-hidden="true" />}
                {isSubmitting ? '등록 준비 중…' : '등록 시작'}
              </button>
            </>
          ) : (
            <>
              <div className="qr-panel">
                <img src={qrSource ?? undefined} alt="Google Authenticator에 등록할 BLOW 관리자 QR 코드" />
                <div>
                  <h2>휴대폰으로 QR 코드를 스캔하세요</h2>
                  <p>QR 코드는 저장하거나 다른 사람에게 보내지 마세요.</p>
                  <details>
                    <summary>QR 스캔이 어려운 경우</summary>
                    <label htmlFor="totp-secret">설정 키</label>
                    <div className="password-control secret-control">
                      <input id="totp-secret" type={showSecret ? 'text' : 'password'} value={enrollment.secret} readOnly />
                      <button
                        type="button"
                        aria-label={showSecret ? '설정 키 숨기기' : '설정 키 표시'}
                        aria-pressed={showSecret}
                        onClick={() => setShowSecret((current) => !current)}
                      >
                        {showSecret ? <EyeOff aria-hidden="true" /> : <Eye aria-hidden="true" />}
                      </button>
                    </div>
                  </details>
                </div>
              </div>
              <MfaCodeForm code={code} isSubmitting={isSubmitting} onCodeChange={setCode} onSubmit={verify} />
            </>
          )}

          <button className="text-button" type="button" onClick={() => void signOut()}>다른 계정으로 로그인</button>
        </section>
      </main>
    );
  }

  if (view === 'challenge') {
    return (
      <main id="main-content" className="center-page">
        <section className="access-card" aria-labelledby="challenge-heading">
          <div className="step-label">관리자 보안 확인 · 2단계</div>
          <header className="card-heading">
            <h1 id="challenge-heading">추가 인증</h1>
            <p>Google Authenticator에서 BLOW 관리자 항목의 6자리 코드를 입력해 주세요.</p>
          </header>
          {errorMessage ? <Message title="인증하지 못했습니다">{errorMessage}</Message> : null}
          <MfaCodeForm code={code} isSubmitting={isSubmitting} onCodeChange={setCode} onSubmit={verify} />
          <button className="text-button" type="button" onClick={() => void signOut()}>다른 계정으로 로그인</button>
        </section>
      </main>
    );
  }

  return <AdminShell session={session} auditCount={auditCount ?? 0} onSignOut={signOut} />;
}

function MfaCodeForm({ code, isSubmitting, onCodeChange, onSubmit }: {
  readonly code: string;
  readonly isSubmitting: boolean;
  readonly onCodeChange: (code: string) => void;
  readonly onSubmit: (event: FormEvent<HTMLFormElement>) => Promise<void>;
}) {
  return (
    <form className="form" onSubmit={(event) => void onSubmit(event)}>
      <div className="field-group">
        <label htmlFor="mfa-code">6자리 인증 코드 <span className="required-label">필수</span></label>
        <input
          id="mfa-code"
          className="code-input"
          type="text"
          inputMode="numeric"
          autoComplete="one-time-code"
          pattern="[0-9]{6}"
          maxLength={6}
          value={code}
          disabled={isSubmitting}
          required
          autoFocus
          onChange={(event) => onCodeChange(event.target.value.replace(/\D/g, '').slice(0, 6))}
        />
        <p className="field-help">코드는 30초마다 바뀝니다.</p>
      </div>
      <button className="button primary full-width" type="submit" disabled={isSubmitting || code.length !== 6}>
        {isSubmitting ? <LoaderCircle className="is-spinning" aria-hidden="true" /> : <ShieldCheck aria-hidden="true" />}
        {isSubmitting ? '확인 중…' : '인증 코드 확인'}
      </button>
    </form>
  );
}

function AdminShell({ session, auditCount, onSignOut }: {
  readonly session: Session;
  readonly auditCount: number;
  readonly onSignOut: () => Promise<void>;
}) {
  const [screen, setScreen] = useState<'overview' | 'members'>('overview');

  return (
    <div className="app-shell">
      <a className="skip-link" href="#main-content">본문으로 건너뛰기</a>
      <header className="topbar">
        <div className="brand" aria-label="BLOW 관리자">
          <span className="brand-sign" aria-hidden="true">B</span>
          <span><strong>BLOW</strong><small>관리자</small></span>
        </div>
        <div className="topbar-actions">
          <div className="secure-session"><ShieldCheck aria-hidden="true" />추가 인증 완료</div>
          <button className="button secondary" type="button" onClick={() => void onSignOut()}>
            <LogOut aria-hidden="true" />로그아웃
          </button>
        </div>
      </header>
      <div className="shell-body">
        <aside className="sidebar" aria-label="관리자 메뉴">
          <nav>
            <button
              className={`nav-button ${screen === 'overview' ? 'is-active' : ''}`}
              type="button"
              aria-current={screen === 'overview' ? 'page' : undefined}
              onClick={() => setScreen('overview')}
            >
              <LayoutDashboard aria-hidden="true" />개요
            </button>
            <button
              className={`nav-button ${screen === 'members' ? 'is-active' : ''}`}
              type="button"
              aria-current={screen === 'members' ? 'page' : undefined}
              onClick={() => setScreen('members')}
            >
              <Users aria-hidden="true" />회원 조회
            </button>
          </nav>
          <div className="account-block">
            <span>관리자 계정</span>
            <strong>{session.user.email ?? '이메일 없음'}</strong>

          </div>
        </aside>
        <main id="main-content" className="main-content">
          {screen === 'overview' ? (
            <>
              <header className="page-heading">
                <h1>관리자 홈</h1>
                <p>관리자 권한과 추가 인증으로 보호된 별도 관리 화면입니다.</p>
              </header>
              <section className="status-strip" aria-label="관리자 보안 상태">
                <StatusItem icon={<UserCheck aria-hidden="true" />} label="계정" value="연결 완료" />
                <StatusItem icon={<ShieldCheck aria-hidden="true" />} label="관리자 권한" value="확인 완료" />
                <StatusItem icon={<LockKeyhole aria-hidden="true" />} label="추가 인증" value="AAL2 보호" />
              </section>
              <section className="workspace" aria-labelledby="ready-heading">
                <div className="ready-mark"><CheckCircle2 aria-hidden="true" /></div>
                <div>
                  <h2 id="ready-heading">관리자 보안 연결이 완료되었습니다</h2>
                  <p>감사 기록 {auditCount.toLocaleString('ko-KR')}건에 대한 읽기 권한까지 확인했습니다.</p>
                  <p className="muted">회원 조회와 변경 사유가 기록되는 이용권 관리 기능을 준비했습니다.</p>
                </div>
              </section>
            </>
          ) : <MembersScreen />}
        </main>
      </div>
    </div>
  );
}

function StatusItem({ icon, label, value }: {
  readonly icon: ReactNode;
  readonly label: string;
  readonly value: string;
}) {
  return (
    <div className="status-item">
      {icon}
      <span><strong>{label}</strong><small><Check aria-hidden="true" />{value}</small></span>
    </div>
  );
}

export function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!supabase) {
      setIsLoading(false);
      return;
    }

    let mounted = true;
    void supabase.auth.getSession().then(({ data }) => {
      if (mounted) {
        setSession(data.session);
        setIsLoading(false);
      }
    });

    const { data } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      if (mounted) {
        setSession(nextSession);
        setIsLoading(false);
      }
    });

    return () => {
      mounted = false;
      data.subscription.unsubscribe();
    };
  }, []);

  if (!supabase) {
    return (
      <main id="main-content" className="center-page">
        <section className="access-card">
          <Message title="앱 연결 설정이 필요합니다">
            관리자 웹의 Supabase 공개 연결값을 설정한 뒤 다시 시작해 주세요.
          </Message>
        </section>
      </main>
    );
  }

  if (isLoading) return <LoadingCard label="로그인 상태를 확인하고 있습니다." />;
  if (!session) return <LoginScreen />;
  return <MfaPanel session={session} onSignedOut={() => setSession(null)} />;
}

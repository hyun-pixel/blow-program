import {
  CheckCircle2,
  Eye,
  EyeOff,
  LoaderCircle,
  ShieldCheck,
  XCircle,
} from 'lucide-react';
import {
  type FormEvent,
  useEffect,
  useRef,
  useState,
} from 'react';
import { getAuthErrorMessage } from './auth-errors.js';
import { supabase } from './supabase.js';

type AuthMode = 'signIn' | 'signUp';

function getErrorCode(error: unknown): string | undefined {
  if (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    typeof error.code === 'string'
  ) {
    return error.code;
  }

  return undefined;
}

export function AuthScreen() {
  const [mode, setMode] = useState<AuthMode>('signIn');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [passwordConfirmation, setPasswordConfirmation] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const errorRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (errorMessage) {
      errorRef.current?.focus();
    }
  }, [errorMessage]);

  const changeMode = (nextMode: AuthMode): void => {
    setMode(nextMode);
    setPassword('');
    setPasswordConfirmation('');
    setErrorMessage(null);
    setNotice(null);
  };

  const submit = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    setErrorMessage(null);
    setNotice(null);

    if (!supabase) {
      setErrorMessage('이 PC의 Supabase 연결 설정을 확인해 주세요.');
      return;
    }

    if (mode === 'signUp' && password !== passwordConfirmation) {
      setErrorMessage('비밀번호가 서로 일치하지 않습니다.');
      return;
    }

    setIsSubmitting(true);

    try {
      if (mode === 'signUp') {
        const { data, error } = await supabase.auth.signUp({ email, password });

        if (error) {
          throw error;
        }

        setPassword('');
        setPasswordConfirmation('');

        if (!data.session) {
          setMode('signIn');
          setNotice(
            '가입 요청을 접수했습니다. 받은 메일에서 인증을 완료한 뒤 로그인해 주세요.',
          );
        }
      } else {
        const { error } = await supabase.auth.signInWithPassword({
          email,
          password,
        });

        if (error) {
          throw error;
        }
      }
    } catch (error) {
      setErrorMessage(getAuthErrorMessage(getErrorCode(error)));
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!supabase) {
    return (
      <main className="auth-page">
        <section className="auth-card" aria-labelledby="auth-heading">
          <div className="auth-brand" aria-label="BLOW">
            <span>blow</span><span className="wordmark-dot">.</span>
          </div>
          <header className="auth-heading">
            <h1 id="auth-heading">앱 연결 설정이 필요합니다</h1>
            <p>이 PC의 Supabase 공개 연결값을 확인한 뒤 앱을 다시 시작해 주세요.</p>
          </header>
        </section>
      </main>
    );
  }

  return (
    <main className="auth-page">
      <section className="auth-card" aria-labelledby="auth-heading">
        <div className="auth-brand" aria-label="BLOW">
          <span>blow</span><span className="wordmark-dot">.</span>
        </div>

        <header className="auth-heading">
          <h1 id="auth-heading">
            {mode === 'signIn' ? '계정에 로그인' : '새 계정 만들기'}
          </h1>
          <p>
            {mode === 'signIn'
              ? '가입한 이메일과 비밀번호를 입력해 주세요.'
              : '이메일 인증을 마치면 BLOW에 로그인할 수 있습니다.'}
          </p>
        </header>

        <div className="auth-mode" aria-label="계정 메뉴">
          <button
            className={mode === 'signIn' ? 'is-active' : undefined}
            type="button"
            aria-pressed={mode === 'signIn'}
            onClick={() => changeMode('signIn')}
          >
            로그인
          </button>
          <button
            className={mode === 'signUp' ? 'is-active' : undefined}
            type="button"
            aria-pressed={mode === 'signUp'}
            onClick={() => changeMode('signUp')}
          >
            회원가입
          </button>
        </div>

        {errorMessage ? (
          <div
            className="message error-message auth-message"
            role="alert"
            ref={errorRef}
            tabIndex={-1}
          >
            <XCircle aria-hidden="true" />
            <div>
              <h2>요청을 완료하지 못했습니다</h2>
              <p>{errorMessage}</p>
            </div>
          </div>
        ) : null}

        {notice ? (
          <div className="message success-message auth-message" role="status">
            <CheckCircle2 aria-hidden="true" />
            <div>
              <h2>이메일을 확인해 주세요</h2>
              <p>{notice}</p>
            </div>
          </div>
        ) : null}

        <form className="auth-form" onSubmit={(event) => void submit(event)}>
          <div className="field-group">
            <label htmlFor="auth-email">이메일</label>
            <input
              id="auth-email"
              type="email"
              autoComplete="email"
              value={email}
              disabled={isSubmitting}
              required
              onChange={(event) => setEmail(event.target.value)}
            />
          </div>

          <div className="field-group">
            <label htmlFor="auth-password">비밀번호</label>
            <div className="password-control">
              <input
                id="auth-password"
                type={showPassword ? 'text' : 'password'}
                autoComplete={mode === 'signIn' ? 'current-password' : 'new-password'}
                value={password}
                minLength={8}
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
                {showPassword ? (
                  <EyeOff aria-hidden="true" />
                ) : (
                  <Eye aria-hidden="true" />
                )}
              </button>
            </div>
            {mode === 'signUp' ? (
              <p className="field-help">8자 이상 입력해 주세요.</p>
            ) : null}
          </div>

          {mode === 'signUp' ? (
            <div className="field-group">
              <label htmlFor="auth-password-confirmation">비밀번호 확인</label>
              <input
                id="auth-password-confirmation"
                type={showPassword ? 'text' : 'password'}
                autoComplete="new-password"
                value={passwordConfirmation}
                minLength={8}
                disabled={isSubmitting}
                required
                aria-invalid={
                  passwordConfirmation.length > 0 &&
                  password !== passwordConfirmation
                }
                onChange={(event) =>
                  setPasswordConfirmation(event.target.value)
                }
              />
            </div>
          ) : null}

          <button
            className="button primary auth-submit"
            type="submit"
            disabled={isSubmitting}
          >
            {isSubmitting ? (
              <LoaderCircle className="is-spinning" aria-hidden="true" />
            ) : null}
            {isSubmitting
              ? '처리 중…'
              : mode === 'signIn'
                ? '로그인'
                : '회원가입'}
          </button>
        </form>

        <div className="auth-security-note">
          <ShieldCheck aria-hidden="true" />
          <p>네이버 아이디와 비밀번호는 BLOW 계정에 사용하지 않습니다.</p>
        </div>
      </section>
    </main>
  );
}
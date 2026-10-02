import { type FormEvent, useEffect, useRef, useState } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import { Eye, EyeOff } from 'lucide-react';
import { recoveryErrorMessage, validateNewPassword } from './password-recovery.js';
import './password-recovery.css';

type Step = 'email' | 'code' | 'security' | 'mfa' | 'password' | 'done';
type Factor = { id: string; friendly_name?: string };

export function PasswordRecovery({ createClient, initialEmail, onBack }: {
  readonly createClient: () => SupabaseClient | null;
  readonly initialEmail: string;
  readonly onBack: (email: string) => void;
}) {
  const [client] = useState(createClient);
  const [step, setStep] = useState<Step>('email');
  const [email, setEmail] = useState(initialEmail);
  const [code, setCode] = useState('');
  const [factors, setFactors] = useState<Factor[]>([]);
  const [factorId, setFactorId] = useState('');
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [resendAt, setResendAt] = useState(0);
  const [now, setNow] = useState(Date.now());
  const headingRef = useRef<HTMLHeadingElement>(null);
  const errorRef = useRef<HTMLDivElement>(null);
  const cooldown = Math.max(0, Math.ceil((resendAt - now) / 1000));

  useEffect(() => { headingRef.current?.focus(); }, [step]);
  useEffect(() => { if (error) errorRef.current?.focus(); }, [error]);
  useEffect(() => {
    if (!resendAt) return;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [resendAt]);
  useEffect(() => () => {
    // Only the isolated recovery session is ended; other tabs stay untouched.
    void client?.auth.signOut({ scope: 'local' }).catch(() => undefined);
  }, [client]);

  const checkSecurity = async (): Promise<void> => {
    if (!client) throw new Error('missing_client');
    const { data, error: factorError } = await client.auth.mfa.listFactors();
    if (factorError) throw factorError;
    const verified = data.all.filter((factor) => factor.status === 'verified');
    const totp = verified.filter((factor) => factor.factor_type === 'totp');
    if (verified.length && !totp.length) {
      setError('이 계정의 추가 인증 수단은 이 화면에서 지원하지 않습니다. 관리자에게 계정 복구를 문의해 주세요.');
      return;
    }
    setFactors(totp);
    setFactorId(totp[0]?.id ?? '');
    setStep(totp.length ? 'mfa' : 'password');
  };

  const submit = async (event?: FormEvent<HTMLFormElement>, resend = false): Promise<void> => {
    event?.preventDefault();
    if (busyRef.current || !client || (resend && cooldown > 0)) return;
    setError('');
    setNotice('');
    if (step === 'password') {
      const validation = validateNewPassword(password, confirmation);
      if (validation) { setError(validation); return; }
    }
    busyRef.current = true;
    setBusy(true);
    try {
      if (step === 'email' || resend) {
        const address = email.trim();
        const { error: sendError } = await client.auth.resetPasswordForEmail(address);
        if (sendError) throw sendError;
        setEmail(address);
        setCode('');
        setNow(Date.now());
        setResendAt(Date.now() + 60_000);
        setNotice('가입된 이메일이면 재설정 메일이 발송됩니다. 받은 편지함과 스팸함을 확인해 주세요.');
        setStep('code');
      } else if (step === 'code') {
        const { data, error: verifyError } = await client.auth.verifyOtp({ email, token: code.trim(), type: 'recovery' });
        if (verifyError) throw verifyError;
        if (!data.session) throw new Error('missing_recovery_session');
        setCode('');
        // The OTP is consumed. A failed security lookup must not verify it again.
        setStep('security');
        await checkSecurity();
      } else if (step === 'security') {
        await checkSecurity();
      } else if (step === 'mfa') {
        const { error: mfaError } = await client.auth.mfa.challengeAndVerify({ factorId, code: code.trim() });
        if (mfaError) throw mfaError;
        setCode('');
        setStep('password');
      } else if (step === 'password') {
        const { error: updateError } = await client.auth.updateUser({ password });
        if (updateError) throw updateError;
        setPassword('');
        setConfirmation('');
        setStep('done');
        // A logout/network error must not turn a successful password change into failure.
        void client.auth.signOut({ scope: 'local' }).catch(() => undefined);
      }
    } catch (failure) {
      setError(recoveryErrorMessage(failure, step === 'password'));
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  };

  const descriptions: Record<Step, string> = {
    email: '가입한 이메일로 인증번호를 받아 새 비밀번호를 설정합니다.',
    code: `${email}로 받은 재설정 메일의 인증번호를 입력해 주세요. 가장 최근에 받은 번호만 사용할 수 있습니다.`,
    security: '이 계정에 등록된 추가 인증 수단을 확인합니다.',
    mfa: '이메일 인증을 완료했습니다. 계정 보호를 위해 등록된 인증 앱의 6자리 번호도 입력해 주세요.',
    password: '이메일 인증을 완료했습니다. 다른 곳에서 사용하지 않는 비밀번호를 입력해 주세요.',
    done: '새 비밀번호로 다시 로그인해 주세요. 관리자 계정의 추가 인증은 그대로 유지됩니다.',
  };
  const labels: Record<Exclude<Step, 'done'>, string> = {
    email: '인증번호 받기', code: '인증번호 확인', security: '보안 상태 다시 확인',
    mfa: '추가 인증 확인', password: '새 비밀번호 저장',
  };

  return (
    <div className="password-recovery">
      <header>
        <h1 id="password-recovery-heading" ref={headingRef} tabIndex={-1}>
          {step === 'done' ? '비밀번호를 변경했습니다' : '비밀번호 재설정'}
        </h1>
        <p>{descriptions[step]}</p>
      </header>
      {!client ? <p role="alert">앱 연결 설정을 확인한 뒤 다시 실행해 주세요.</p> : null}
      {error ? <div className="message error-message" role="alert" ref={errorRef} tabIndex={-1}><p>{error}</p></div> : null}
      {notice ? <div className="message success-message" role="status"><p>{notice}</p></div> : null}
      {step !== 'done' ? (
        <form className="recovery-form" onSubmit={(event) => void submit(event)} aria-busy={busy}>
          {step === 'email' ? (
            <div className="field-group">
              <label htmlFor="recovery-email">가입한 이메일</label>
              <input id="recovery-email" type="email" autoComplete="email" required value={email} disabled={busy} onChange={(event) => setEmail(event.target.value)} />
            </div>
          ) : null}
          {step === 'code' || step === 'mfa' ? (
            <>
              {step === 'mfa' && factors.length > 1 ? (
                <div className="field-group">
                  <label htmlFor="recovery-factor">인증 앱 선택</label>
                  <select id="recovery-factor" value={factorId} disabled={busy} onChange={(event) => setFactorId(event.target.value)}>
                    {factors.map((factor, index) => <option key={factor.id} value={factor.id}>{factor.friendly_name || `인증 앱 ${index + 1}`}</option>)}
                  </select>
                </div>
              ) : null}
              <div className="field-group">
                <label htmlFor="recovery-code">{step === 'mfa' ? '인증 앱 번호' : '이메일 인증번호'}</label>
                <input id="recovery-code" type="text" inputMode="numeric" autoComplete="one-time-code" pattern={step === 'mfa' ? '[0-9]{6}' : '[0-9]{6,10}'} maxLength={step === 'mfa' ? 6 : 10} required value={code} disabled={busy} onChange={(event) => setCode(event.target.value.replace(/\s/g, ''))} />
              </div>
            </>
          ) : null}
          {step === 'password' ? (
            <>
              <div className="field-group">
                <label htmlFor="recovery-password">새 비밀번호</label>
                <div className="password-control">
                  <input id="recovery-password" type={showPassword ? 'text' : 'password'} autoComplete="new-password" minLength={8} required value={password} disabled={busy} aria-describedby="recovery-password-help" onChange={(event) => setPassword(event.target.value)} />
                  <button type="button" aria-label={showPassword ? '비밀번호 숨기기' : '비밀번호 표시'} aria-pressed={showPassword} onClick={() => setShowPassword(!showPassword)}>
                    {showPassword ? <EyeOff aria-hidden="true" /> : <Eye aria-hidden="true" />}
                  </button>
                </div>
                <p id="recovery-password-help">8자 이상 입력해 주세요.</p>
              </div>
              <div className="field-group">
                <label htmlFor="recovery-confirmation">새 비밀번호 확인</label>
                <input id="recovery-confirmation" type={showPassword ? 'text' : 'password'} autoComplete="new-password" minLength={8} required value={confirmation} disabled={busy} onChange={(event) => setConfirmation(event.target.value)} />
              </div>
            </>
          ) : null}
          <button className="button primary" type="submit" disabled={busy || !client}>{busy ? '처리 중…' : labels[step]}</button>
          {step === 'code' ? <button className="button" type="button" disabled={busy || cooldown > 0} onClick={() => void submit(undefined, true)}>{cooldown > 0 ? `${cooldown}초 후 다시 받기` : '인증번호 다시 받기'}</button> : null}
        </form>
      ) : null}
      <button className={`button${step === 'done' ? ' primary' : ''}`} type="button" disabled={busy} onClick={() => onBack(email)}>로그인으로 돌아가기</button>
      {step === 'code' ? <p className="recovery-help">메일에 번호가 없거나 도착하지 않으면 BLOW 관리자에게 문의해 주세요. 인증번호와 비밀번호는 다른 사람에게 알려주지 마세요.</p> : null}
    </div>
  );
}

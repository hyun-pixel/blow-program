import { createClient } from '@supabase/supabase-js';

// Recovery must not sign the normal app client in or persist/broadcast tokens.
export function createRecoveryClient(url: string, publishableKey: string) {
  return createClient(url, publishableKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
      storageKey: `blow-password-recovery-${crypto.randomUUID()}`,
    },
    global: {
      fetch: (input, init) => fetch(input, {
        ...init,
        signal: init?.signal
          ? AbortSignal.any([init.signal, AbortSignal.timeout(20_000)])
          : AbortSignal.timeout(20_000),
      }),
    },
  });
}

export function validateNewPassword(password: string, confirmation: string): string | null {
  if (password.length < 8) return '새 비밀번호를 8자 이상 입력해 주세요.';
  if (password !== confirmation) return '새 비밀번호와 비밀번호 확인이 일치하지 않습니다.';
  return null;
}

export function recoveryErrorMessage(error: unknown, updatingPassword = false): string {
  const code = typeof error === 'object' && error !== null && 'code' in error
    ? String(error.code) : '';
  switch (code) {
    case 'otp_expired':
    case 'otp_disabled':
    case 'access_denied':
      return '인증번호가 올바르지 않거나 만료되었습니다. 메일의 최신 번호를 입력하거나 다시 받아 주세요.';
    case 'over_email_send_rate_limit':
    case 'over_request_rate_limit':
      return '요청이 너무 많습니다. 잠시 기다린 뒤 다시 시도해 주세요.';
    case 'email_address_invalid':
      return '올바른 이메일 주소를 입력해 주세요.';
    case 'same_password':
      return '현재 비밀번호와 다른 새 비밀번호를 입력해 주세요.';
    case 'weak_password':
      return '다른 곳에서 사용하지 않는 더 안전한 비밀번호를 입력해 주세요.';
    case 'mfa_verification_failed':
      return '인증 앱의 최신 6자리 번호를 확인해 다시 입력해 주세요.';
    case 'insufficient_aal':
      return '추가 인증이 필요합니다. 로그인으로 돌아가 비밀번호 재설정을 다시 시작해 주세요.';
    case 'session_expired':
    case 'session_not_found':
    case 'refresh_token_not_found':
    case 'reauthentication_needed':
      return '인증 시간이 만료되었습니다. 로그인으로 돌아가 인증번호를 다시 받아 주세요.';
    default:
      return updatingPassword
        ? '변경 결과를 확인하지 못했습니다. 연결을 확인한 뒤 새 비밀번호로 로그인을 시도하거나 재설정을 다시 진행해 주세요.'
        : '요청을 완료하지 못했습니다. 인터넷 연결을 확인한 뒤 다시 시도해 주세요.';
  }
}

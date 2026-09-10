const messages: Readonly<Record<string, string>> = {
  email_address_invalid: '올바른 이메일 주소를 입력해 주세요.',
  email_address_not_authorized: '현재 이 이메일로 인증 메일을 보낼 수 없습니다.',
  email_not_confirmed: '이메일 인증을 완료한 뒤 로그인해 주세요.',
  invalid_credentials: '이메일 또는 비밀번호를 확인해 주세요.',
  over_email_send_rate_limit: '인증 메일 요청이 너무 많습니다. 잠시 후 다시 시도해 주세요.',
  over_request_rate_limit: '요청이 너무 많습니다. 잠시 후 다시 시도해 주세요.',
  signup_disabled: '현재 신규 회원가입이 중지되어 있습니다.',
  user_already_exists: '이미 가입된 이메일입니다. 로그인해 주세요.',
  weak_password: '더 안전한 비밀번호를 입력해 주세요.',
};

export function getAuthErrorMessage(code?: string): string {
  return (
    (code ? messages[code] : undefined) ??
    '요청을 처리하지 못했습니다. 네트워크 연결을 확인한 뒤 다시 시도해 주세요.'
  );
}
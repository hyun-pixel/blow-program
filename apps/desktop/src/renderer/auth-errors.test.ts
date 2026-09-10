import { describe, expect, it } from 'vitest';
import { getAuthErrorMessage } from './auth-errors.js';

describe('getAuthErrorMessage', () => {
  it('로그인 오류를 사용자용 문장으로 바꾼다', () => {
    expect(getAuthErrorMessage('invalid_credentials')).toBe(
      '이메일 또는 비밀번호를 확인해 주세요.',
    );
    expect(getAuthErrorMessage('email_not_confirmed')).toBe(
      '이메일 인증을 완료한 뒤 로그인해 주세요.',
    );
    expect(getAuthErrorMessage()).toContain('네트워크 연결');
  });
});
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createRecoveryClient, recoveryErrorMessage, validateNewPassword } from './password-recovery.js';

afterEach(() => vi.unstubAllGlobals());

describe('password recovery', () => {
  it('requires matching passwords without trimming or changing them', () => {
    expect(validateNewPassword('short', 'short')).toContain('8자');
    expect(validateNewPassword('new-password', 'different')).toContain('일치');
    expect(validateNewPassword(' new-password ', 'new-password')).toContain('일치');
    expect(validateNewPassword(' new-password ', ' new-password ')).toBeNull();
  });

  it('maps safe recovery failures without echoing server details or secrets', () => {
    expect(recoveryErrorMessage({ code: 'otp_expired', message: 'secret' })).toContain('만료');
    expect(recoveryErrorMessage({ code: 'same_password' })).toContain('다른');
    expect(recoveryErrorMessage({ code: 'mfa_verification_failed' })).toContain('인증 앱');
    expect(recoveryErrorMessage({ code: 'over_email_send_rate_limit' })).toContain('기다린');
    expect(recoveryErrorMessage({ code: 'unknown', message: 'secret' })).not.toContain('secret');
    expect(recoveryErrorMessage(new Error('network'), true)).toContain('변경 결과를 확인하지 못했습니다');
  });

  it('uses a memory-only session with a unique storage key and bounded network calls', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('{}', { status: 200, headers: { 'Content-Type': 'application/json' } }));
    vi.stubGlobal('fetch', fetchMock);
    const client = createRecoveryClient('https://recovery-test.supabase.co', 'sb_publishable_test_only');
    const other = createRecoveryClient('https://recovery-test.supabase.co', 'sb_publishable_test_only');
    const settings = client.auth as unknown as { persistSession: boolean; autoRefreshToken: boolean; detectSessionInUrl: boolean; storageKey: string };
    const otherSettings = other.auth as unknown as { storageKey: string };
    expect(settings.persistSession).toBe(false);
    expect(settings.autoRefreshToken).toBe(false);
    expect(settings.detectSessionInUrl).toBe(false);
    expect(settings.storageKey).not.toBe(otherSettings.storageKey);
    await client.auth.resetPasswordForEmail('test@example.com');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toContain('/auth/v1/recover');
    expect(JSON.parse(init.body)).toMatchObject({ email: 'test@example.com' });
    expect(init.signal).toBeInstanceOf(AbortSignal);
    expect((await client.auth.getSession()).data.session).toBeNull();
  });
});

import { describe, expect, it } from 'vitest';
import {
  formatAuditAction,
  formatAuditLicense,
  formatAuditTarget,
  formatAuditValue,
} from './audit-view.js';

describe('audit view helpers', () => {
  it('formats a stored license snapshot', () => {
    const result = formatAuditLicense({
      status: 'active',
      starts_at: '2026-09-12T00:00:00Z',
      ends_at: '2026-10-12T00:00:00Z',
    });

    expect(result.status).toBe('이용 중');
    expect(result.period).toContain('–');
    expect(result.period).not.toContain('확인 필요');
  });

  it('handles a missing or malformed snapshot safely', () => {
    expect(formatAuditLicense(null)).toEqual({ status: '이용권 없음', period: '기록 없음' });
    expect(formatAuditLicense({ status: 1 })).toMatchObject({ status: '상태 확인 필요' });
  });

  it('formats an account status change', () => {
    expect(formatAuditAction('account.status_updated')).toBe('계정 상태 변경');
    expect(formatAuditValue('account.status_updated', { account_status: 'suspended' }))
      .toEqual({ title: '정지', detail: '회원 계정 상태' });
  });

  it('formats a device registration reset without exposing its hash', () => {
    expect(formatAuditAction('device.registration_reset')).toBe('등록 PC 해제');
    expect(formatAuditValue('device.registration_reset', {
      device_hash: 'secret-device-hash',
      registered_at: '2026-09-13T00:00:00Z',
    })).toMatchObject({ title: '등록됨' });
    expect(formatAuditValue('device.registration_reset', null))
      .toEqual({ title: '미등록', detail: '다음 로그인 PC를 등록할 수 있음' });
  });

  it('formats an operation control change', () => {
    expect(formatAuditAction('app_controls.updated')).toBe('운영 제어 변경');
    expect(formatAuditTarget('app_controls.updated', null)).toBe('전체 사용자');
    expect(formatAuditValue('app_controls.updated', {
      minimum_version: '0.1.0',
      automation_enabled: true,
    })).toEqual({ title: '최소 버전 0.1.0', detail: '자동 입력 사용 가능' });
  });
});




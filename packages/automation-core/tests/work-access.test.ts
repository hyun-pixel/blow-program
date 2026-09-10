import { describe, expect, it } from 'vitest';
import {
  decideLicenseAccess,
  decideWorkAccess,
  type WorkAccessBlockReason,
  type WorkAccessInput,
} from '../src/index.js';

const allowedInput: WorkAccessInput = {
  serverAvailable: true,
  signedIn: true,
  emailVerified: true,
  accountStatus: 'active',
  licenseStatus: 'active',
  licenseStartsAt: '2026-09-01T00:00:00+09:00',
  licenseEndsAt: '2026-09-15T00:00:00+09:00',
  registeredDeviceHash: 'registered-device',
  currentDeviceHash: 'registered-device',
  minimumVersionSatisfied: true,
  automationEnabled: true,
  now: '2026-09-10T12:00:00+09:00',
};

describe('decideLicenseAccess', () => {
  it('현재 이용 기간 안의 활성 이용권만 허용한다', () => {
    expect(
      decideLicenseAccess({
        status: 'active',
        startsAt: allowedInput.licenseStartsAt,
        endsAt: allowedInput.licenseEndsAt,
        now: allowedInput.now,
      }),
    ).toEqual({
      allowed: true,
      expiresAt: allowedInput.licenseEndsAt,
    });

    expect(
      decideLicenseAccess({
        status: 'inactive',
        startsAt: allowedInput.licenseStartsAt,
        endsAt: allowedInput.licenseEndsAt,
        now: allowedInput.now,
      }),
    ).toEqual({ allowed: false, reason: 'LICENSE_INACTIVE' });
  });
});

describe('decideWorkAccess', () => {
  it('allows only an active, verified account with a valid license and matching device', () => {
    expect(decideWorkAccess(allowedInput)).toEqual({
      allowed: true,
      expiresAt: allowedInput.licenseEndsAt,
    });

    const blockedCases: ReadonlyArray<
      readonly [Partial<WorkAccessInput>, WorkAccessBlockReason]
    > = [
      [{ serverAvailable: false }, 'SERVER_UNAVAILABLE'],
      [{ signedIn: false }, 'SIGNED_OUT'],
      [{ emailVerified: false }, 'EMAIL_NOT_VERIFIED'],
      [{ accountStatus: 'suspended' }, 'ACCOUNT_SUSPENDED'],
      [{ minimumVersionSatisfied: false }, 'UPDATE_REQUIRED'],
      [{ automationEnabled: false }, 'AUTOMATION_DISABLED'],
      [{ licenseStatus: 'inactive' }, 'LICENSE_INACTIVE'],
      [{ licenseEndsAt: 'invalid-date' }, 'LICENSE_INVALID'],
      [{ now: '2026-08-31T23:59:59+09:00' }, 'LICENSE_NOT_STARTED'],
      [{ now: allowedInput.licenseEndsAt }, 'LICENSE_EXPIRED'],
      [{ registeredDeviceHash: null }, 'DEVICE_REGISTRATION_REQUIRED'],
      [{ currentDeviceHash: 'other-device' }, 'DEVICE_MISMATCH'],
    ];

    for (const [changes, reason] of blockedCases) {
      expect(decideWorkAccess({ ...allowedInput, ...changes })).toEqual({
        allowed: false,
        reason,
      });
    }
  });
});
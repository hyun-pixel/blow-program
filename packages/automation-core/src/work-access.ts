export type WorkAccessBlockReason =
  | 'SERVER_UNAVAILABLE'
  | 'SIGNED_OUT'
  | 'EMAIL_NOT_VERIFIED'
  | 'ACCOUNT_SUSPENDED'
  | 'UPDATE_REQUIRED'
  | 'AUTOMATION_DISABLED'
  | 'LICENSE_INACTIVE'
  | 'LICENSE_INVALID'
  | 'LICENSE_NOT_STARTED'
  | 'LICENSE_EXPIRED'
  | 'DEVICE_REGISTRATION_REQUIRED'
  | 'DEVICE_MISMATCH';

export interface WorkAccessInput {
  readonly serverAvailable: boolean;
  readonly signedIn: boolean;
  readonly emailVerified: boolean;
  readonly accountStatus: 'active' | 'suspended';
  readonly licenseStatus: 'active' | 'inactive';
  readonly licenseStartsAt: string;
  readonly licenseEndsAt: string;
  readonly registeredDeviceHash: string | null;
  readonly currentDeviceHash: string;
  readonly minimumVersionSatisfied: boolean;
  readonly automationEnabled: boolean;
  readonly now: string;
}

export type WorkAccessDecision =
  | { readonly allowed: true; readonly expiresAt: string }
  | { readonly allowed: false; readonly reason: WorkAccessBlockReason };

export function decideWorkAccess(
  input: WorkAccessInput,
): WorkAccessDecision {
  if (!input.serverAvailable) {
    return { allowed: false, reason: 'SERVER_UNAVAILABLE' };
  }

  if (!input.signedIn) {
    return { allowed: false, reason: 'SIGNED_OUT' };
  }

  if (!input.emailVerified) {
    return { allowed: false, reason: 'EMAIL_NOT_VERIFIED' };
  }

  if (input.accountStatus !== 'active') {
    return { allowed: false, reason: 'ACCOUNT_SUSPENDED' };
  }

  if (!input.minimumVersionSatisfied) {
    return { allowed: false, reason: 'UPDATE_REQUIRED' };
  }

  if (!input.automationEnabled) {
    return { allowed: false, reason: 'AUTOMATION_DISABLED' };
  }

  if (input.licenseStatus !== 'active') {
    return { allowed: false, reason: 'LICENSE_INACTIVE' };
  }

  const now = Date.parse(input.now);
  const startsAt = Date.parse(input.licenseStartsAt);
  const endsAt = Date.parse(input.licenseEndsAt);

  if (
    !Number.isFinite(now) ||
    !Number.isFinite(startsAt) ||
    !Number.isFinite(endsAt) ||
    endsAt <= startsAt
  ) {
    return { allowed: false, reason: 'LICENSE_INVALID' };
  }

  if (now < startsAt) {
    return { allowed: false, reason: 'LICENSE_NOT_STARTED' };
  }

  if (now >= endsAt) {
    return { allowed: false, reason: 'LICENSE_EXPIRED' };
  }

  if (!input.registeredDeviceHash || !input.currentDeviceHash) {
    return { allowed: false, reason: 'DEVICE_REGISTRATION_REQUIRED' };
  }

  if (input.registeredDeviceHash !== input.currentDeviceHash) {
    return { allowed: false, reason: 'DEVICE_MISMATCH' };
  }

  return { allowed: true, expiresAt: input.licenseEndsAt };
}
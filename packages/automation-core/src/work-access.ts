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

export type LicenseAccessBlockReason =
  | 'LICENSE_INACTIVE'
  | 'LICENSE_INVALID'
  | 'LICENSE_NOT_STARTED'
  | 'LICENSE_EXPIRED';

export interface LicenseAccessInput {
  readonly status: 'active' | 'inactive';
  readonly startsAt: string;
  readonly endsAt: string;
  readonly now: string;
}

export type LicenseAccessDecision =
  | { readonly allowed: true; readonly expiresAt: string }
  | { readonly allowed: false; readonly reason: LicenseAccessBlockReason };

export type DeviceAccessBlockReason =
  | 'DEVICE_REGISTRATION_REQUIRED'
  | 'DEVICE_MISMATCH';

export interface DeviceAccessInput {
  readonly registeredDeviceHash: string | null;
  readonly currentDeviceHash: string;
}

export type DeviceAccessDecision =
  | { readonly allowed: true }
  | { readonly allowed: false; readonly reason: DeviceAccessBlockReason };

export function isVersionAtLeast(
  currentVersion: string,
  minimumVersion: string,
): boolean {
  const parse = (
    value: string,
  ): readonly [number, number, number] | null => {
    const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(value);

    if (!match) {
      return null;
    }

    const parts = [
      Number(match[1]),
      Number(match[2]),
      Number(match[3]),
    ] as const;
    return parts.every(Number.isSafeInteger) ? parts : null;
  };
  const current = parse(currentVersion);
  const minimum = parse(minimumVersion);

  if (!current || !minimum) {
    return false;
  }

  for (const index of [0, 1, 2] as const) {
    if (current[index] !== minimum[index]) {
      return current[index] > minimum[index];
    }
  }

  return true;
}

export function decideLicenseAccess(
  input: LicenseAccessInput,
): LicenseAccessDecision {
  if (input.status !== 'active') {
    return { allowed: false, reason: 'LICENSE_INACTIVE' };
  }

  const now = Date.parse(input.now);
  const startsAt = Date.parse(input.startsAt);
  const endsAt = Date.parse(input.endsAt);

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

  return { allowed: true, expiresAt: input.endsAt };
}

export function decideDeviceAccess(
  input: DeviceAccessInput,
): DeviceAccessDecision {
  if (!input.registeredDeviceHash || !input.currentDeviceHash) {
    return { allowed: false, reason: 'DEVICE_REGISTRATION_REQUIRED' };
  }

  if (input.registeredDeviceHash !== input.currentDeviceHash) {
    return { allowed: false, reason: 'DEVICE_MISMATCH' };
  }

  return { allowed: true };
}

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

  const licenseDecision = decideLicenseAccess({
    status: input.licenseStatus,
    startsAt: input.licenseStartsAt,
    endsAt: input.licenseEndsAt,
    now: input.now,
  });

  if (!licenseDecision.allowed) {
    return licenseDecision;
  }

  const deviceDecision = decideDeviceAccess({
    registeredDeviceHash: input.registeredDeviceHash,
    currentDeviceHash: input.currentDeviceHash,
  });

  if (!deviceDecision.allowed) {
    return deviceDecision;
  }

  return licenseDecision;
}
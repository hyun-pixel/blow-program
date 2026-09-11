import { describe, expect, it } from 'vitest';
import { decideAdminAccess } from './admin-access.js';

describe('decideAdminAccess', () => {
  it('denies a signed-in user without the admin role', () => {
    expect(
      decideAdminAccess({
        isAdmin: false,
        currentLevel: 'aal2',
        hasVerifiedTotp: true,
      }),
    ).toBe('denied');
  });

  it('requires enrollment when an admin has no verified TOTP factor', () => {
    expect(
      decideAdminAccess({
        isAdmin: true,
        currentLevel: 'aal1',
        hasVerifiedTotp: false,
      }),
    ).toBe('enroll');
  });

  it('requires a challenge when an admin already has a verified TOTP factor', () => {
    expect(
      decideAdminAccess({
        isAdmin: true,
        currentLevel: 'aal1',
        hasVerifiedTotp: true,
      }),
    ).toBe('challenge');
  });

  it('allows an admin only after the session reaches AAL2', () => {
    expect(
      decideAdminAccess({
        isAdmin: true,
        currentLevel: 'aal2',
        hasVerifiedTotp: true,
      }),
    ).toBe('ready');
  });
});
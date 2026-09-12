import { describe, expect, it } from 'vitest';
import { getLicenseDisplayState, normalizeMemberSearch } from './member-view.js';

describe('member view helpers', () => {
  it('uses null for an empty member search', () => {
    expect(normalizeMemberSearch('   ')).toBeNull();
    expect(normalizeMemberSearch(' user@example.com ')).toBe('user@example.com');
  });

  it('distinguishes active, expired, inactive, and missing licenses', () => {
    const now = Date.parse('2026-09-11T00:00:00Z');

    expect(getLicenseDisplayState('active', '2026-09-12T00:00:00Z', now)).toBe('active');
    expect(getLicenseDisplayState('active', '2026-09-10T00:00:00Z', now)).toBe('expired');
    expect(getLicenseDisplayState('inactive', '2026-09-12T00:00:00Z', now)).toBe('inactive');
    expect(getLicenseDisplayState(null, null, now)).toBe('none');
  });
});
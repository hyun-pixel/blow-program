import { describe, expect, it } from 'vitest';
import {
  getLicenseDisplayState,
  localDateTimeToIso,
  normalizeMemberSearch,
  resolveLicenseDateTime,
  toLocalDateTimeInput,
} from './member-view.js';

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

  it('converts local license date-time values without losing the selected time', () => {
    const localDate = new Date(2026, 8, 12, 9, 30);
    const inputValue = toLocalDateTimeInput(null, localDate);

    expect(inputValue).toBe('2026-09-12T09:30');
    expect(localDateTimeToIso(inputValue)).toBe(localDate.toISOString());
    expect(localDateTimeToIso('not-a-date')).toBeNull();
  });

  it('preserves the exact stored timestamp when its visible minute is unchanged', () => {
    const original = '2026-09-12T09:30:42.123+09:00';
    const visibleValue = toLocalDateTimeInput(original, new Date(original));

    expect(resolveLicenseDateTime(visibleValue, original)).toBe(original);
  });
});

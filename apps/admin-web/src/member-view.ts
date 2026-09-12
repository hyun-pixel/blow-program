export type LicenseDisplayState = 'active' | 'expired' | 'inactive' | 'none';

export function normalizeMemberSearch(value: string): string | null {
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
}

export function getLicenseDisplayState(
  status: string | null,
  endsAt: string | null,
  now: number,
): LicenseDisplayState {
  if (status === null) return 'none';
  if (status !== 'active') return 'inactive';
  if (endsAt === null || Date.parse(endsAt) <= now) return 'expired';
  return 'active';
}
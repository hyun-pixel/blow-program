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

function padDatePart(value: number): string {
  return String(value).padStart(2, '0');
}

export function toLocalDateTimeInput(value: string | null, fallback: Date): string {
  const parsed = value ? new Date(value) : fallback;
  const date = Number.isNaN(parsed.getTime()) ? fallback : parsed;

  return [
    date.getFullYear(),
    '-',
    padDatePart(date.getMonth() + 1),
    '-',
    padDatePart(date.getDate()),
    'T',
    padDatePart(date.getHours()),
    ':',
    padDatePart(date.getMinutes()),
  ].join('');
}

export function localDateTimeToIso(value: string): string | null {
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

export function resolveLicenseDateTime(value: string, originalValue: string | null): string | null {
  if (originalValue) {
    const originalDate = new Date(originalValue);
    if (
      !Number.isNaN(originalDate.getTime())
      && toLocalDateTimeInput(originalValue, originalDate) === value
    ) {
      return originalValue;
    }
  }

  return localDateTimeToIso(value);
}

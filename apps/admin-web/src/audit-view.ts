type LicenseSnapshot = {
  readonly status: string | null;
  readonly startsAt: string | null;
  readonly endsAt: string | null;
};

export type AuditLicenseDisplay = {
  readonly status: string;
  readonly period: string;
};

export type AuditValueDisplay = {
  readonly title: string;
  readonly detail: string;
};

const dateTimeFormatter = new Intl.DateTimeFormat('ko-KR', {
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
});

function readString(record: Record<string, unknown>, key: string): string | null {
  return typeof record[key] === 'string' ? record[key] : null;
}

function readLicenseSnapshot(value: unknown): LicenseSnapshot | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;

  const record = value as Record<string, unknown>;
  return {
    status: readString(record, 'status'),
    startsAt: readString(record, 'starts_at'),
    endsAt: readString(record, 'ends_at'),
  };
}

function formatDateTime(value: string | null): string {
  if (!value) return '없음';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '확인 필요' : dateTimeFormatter.format(date);
}

export function formatAuditDateTime(value: string): string {
  return formatDateTime(value);
}

export function formatAuditLicense(value: unknown): AuditLicenseDisplay {
  const license = readLicenseSnapshot(value);
  if (!license) return { status: '이용권 없음', period: '기록 없음' };

  const status = license.status === 'active'
    ? '이용 중'
    : license.status === 'inactive'
      ? '이용 중지'
      : '상태 확인 필요';

  return {
    status,
    period: `${formatDateTime(license.startsAt)} – ${formatDateTime(license.endsAt)}`,
  };
}


export function formatAuditAction(action: string): string {
  if (action === 'license.updated') return '이용권 변경';
  if (action === 'app_controls.updated') return '운영 제어 변경';
  if (action === 'device.registration_reset') return '등록 PC 해제';
  if (action === 'account.status_updated') return '계정 상태 변경';
  return '기타 변경';
}

export function formatAuditTarget(action: string, targetUserId: string | null): string {
  if (action === 'app_controls.updated') return '전체 사용자';
  return targetUserId ?? '없음';
}

export function formatAuditValue(action: string, value: unknown): AuditValueDisplay {
  if (action === 'license.updated') {
    const license = formatAuditLicense(value);
    return { title: license.status, detail: license.period };
  }

  if (action === 'account.status_updated' && value && typeof value === 'object' && !Array.isArray(value)) {
    const status = readString(value as Record<string, unknown>, 'account_status');
    return {
      title: status === 'active' ? '정상' : status === 'suspended' ? '정지' : '상태 확인 필요',
      detail: '회원 계정 상태',
    };
  }

  if (action === 'device.registration_reset') {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return { title: '미등록', detail: '다음 로그인 PC를 등록할 수 있음' };
    }
    const registeredAt = readString(value as Record<string, unknown>, 'registered_at');
    return { title: '등록됨', detail: `등록 시각 ${formatDateTime(registeredAt)}` };
  }

  if (action === 'app_controls.updated' && value && typeof value === 'object' && !Array.isArray(value)) {
    const record = value as Record<string, unknown>;
    const version = readString(record, 'minimum_version') ?? '확인 필요';
    const automation = typeof record.automation_enabled === 'boolean'
      ? record.automation_enabled ? '사용 가능' : '긴급 중지'
      : '확인 필요';
    return { title: `최소 버전 ${version}`, detail: `자동 입력 ${automation}` };
  }

  return { title: '기록 확인 필요', detail: '지원하지 않는 변경 형식' };
}



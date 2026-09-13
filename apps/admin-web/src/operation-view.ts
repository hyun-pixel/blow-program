export type OperationControls = {
  readonly minimum_version: string;
  readonly automation_enabled: boolean;
  readonly updated_at: string;
  readonly active_member_count: number;
};

export type OperationDraft = {
  readonly minimumVersion: string;
  readonly automationEnabled: boolean;
  readonly reason: string;
};

const versionPattern = /^[0-9]+[.][0-9]+[.][0-9]+$/;

export function hasOperationChanges(controls: OperationControls, draft: OperationDraft): boolean {
  return controls.minimum_version !== draft.minimumVersion.trim()
    || controls.automation_enabled !== draft.automationEnabled;
}

export function validateOperationDraft(controls: OperationControls, draft: OperationDraft): string | null {
  if (!versionPattern.test(draft.minimumVersion.trim())) {
    return '최소 지원 버전은 0.1.0처럼 숫자 세 묶음으로 입력해 주세요.';
  }

  const reasonLength = draft.reason.trim().length;
  if (reasonLength < 5 || reasonLength > 500) {
    return '변경 사유를 5–500자로 입력해 주세요.';
  }

  return hasOperationChanges(controls, draft) ? null : '변경된 설정이 없습니다.';
}

export function describeOperationImpact(
  controls: OperationControls,
  draft: OperationDraft,
): readonly string[] {
  const memberCount = controls.active_member_count.toLocaleString('ko-KR');
  const messages: string[] = [];

  if (controls.minimum_version !== draft.minimumVersion.trim()) {
    messages.push(`최소 지원 버전이 ${controls.minimum_version}에서 ${draft.minimumVersion.trim()}로 바뀝니다. 활성 회원 최대 ${memberCount}명에게 영향을 줄 수 있습니다.`);
  }

  if (controls.automation_enabled !== draft.automationEnabled) {
    messages.push(draft.automationEnabled
      ? `자동 입력 긴급 중지가 해제되어 활성 회원 ${memberCount}명이 새 작업을 시작할 수 있습니다.`
      : `자동 입력이 긴급 중지되어 활성 회원 ${memberCount}명의 새 자동 입력 시작이 차단될 수 있습니다.`);
  }

  return messages;
}

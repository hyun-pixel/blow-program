import { describe, expect, it } from 'vitest';
import {
  describeOperationImpact,
  hasOperationChanges,
  validateOperationDraft,
  type OperationControls,
} from './operation-view.js';

const controls: OperationControls = {
  minimum_version: '0.1.0',
  automation_enabled: true,
  updated_at: '2026-09-13T00:00:00Z',
  active_member_count: 1,
};

describe('operation view helpers', () => {
  it('requires a valid version, reason, and actual change', () => {
    expect(validateOperationDraft(controls, { minimumVersion: '0.1', automationEnabled: true, reason: '테스트 변경' })).toContain('0.1.0');
    expect(validateOperationDraft(controls, { minimumVersion: '0.1.1', automationEnabled: true, reason: '짧음' })).toContain('5–500자');
    expect(validateOperationDraft(controls, { minimumVersion: '0.1.0', automationEnabled: true, reason: '테스트 변경' })).toBe('변경된 설정이 없습니다.');
    expect(validateOperationDraft(controls, { minimumVersion: '0.1.1', automationEnabled: true, reason: '테스트 변경' })).toBeNull();
  });

  it('describes version and emergency-stop impact', () => {
    const draft = { minimumVersion: '0.1.1', automationEnabled: false, reason: '테스트 변경' };

    expect(hasOperationChanges(controls, draft)).toBe(true);
    expect(describeOperationImpact(controls, draft)).toHaveLength(2);
    expect(describeOperationImpact(controls, draft).join(' ')).toContain('활성 회원 1명');
  });
});

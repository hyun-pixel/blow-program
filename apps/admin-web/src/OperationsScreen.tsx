import { AlertCircle, CheckCircle2, LoaderCircle, Save, ShieldAlert } from 'lucide-react';
import { type FormEvent, useEffect, useState } from 'react';
import {
  describeOperationImpact,
  hasOperationChanges,
  validateOperationDraft,
  type OperationControls,
  type OperationDraft,
} from './operation-view.js';
import { supabase } from './supabase.js';

const dateTimeFormatter = new Intl.DateTimeFormat('ko-KR', {
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
});

export function OperationsScreen() {
  const [controls, setControls] = useState<OperationControls | null>(null);
  const [draft, setDraft] = useState<OperationDraft | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    void supabase?.rpc('admin_get_app_control_summary').then(({ data, error }) => {
      if (cancelled) return;
      const loaded = (data as OperationControls[] | null)?.[0] ?? null;

      if (error || !loaded) {
        setErrorMessage('운영 상태를 불러오지 못했습니다. 운영 제어 SQL과 추가 인증 상태를 확인해 주세요.');
      } else {
        setControls(loaded);
        setDraft({
          minimumVersion: loaded.minimum_version,
          automationEnabled: loaded.automation_enabled,
          reason: '',
        });
      }
      setIsLoading(false);
    });

    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (errorMessage) document.getElementById('operation-error')?.focus();
  }, [errorMessage]);

  const saveControls = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    if (!supabase || !controls || !draft) return;

    const validationError = validateOperationDraft(controls, draft);
    if (validationError) {
      setErrorMessage(validationError);
      return;
    }

    const impacts = describeOperationImpact(controls, draft);
    if (!window.confirm(`${impacts.join('\n\n')}\n\n현재 실행 중인 사용자 프로그램에도 즉시 적용될 수 있습니다. 저장할까요?`)) {
      return;
    }

    setIsSaving(true);
    setErrorMessage(null);
    setSuccessMessage(null);

    const { data, error } = await supabase.rpc('admin_set_app_controls', {
      next_minimum_version: draft.minimumVersion.trim(),
      next_automation_enabled: draft.automationEnabled,
      change_reason: draft.reason.trim(),
    });
    const updated = (data as Omit<OperationControls, 'active_member_count'>[] | null)?.[0] ?? null;

    if (error || !updated) {
      setErrorMessage('운영 설정을 저장하지 못했습니다. 추가 인증 상태와 입력값을 확인한 뒤 다시 시도해 주세요.');
      setIsSaving(false);
      return;
    }

    const nextControls = { ...updated, active_member_count: controls.active_member_count };
    setControls(nextControls);
    setDraft({
      minimumVersion: updated.minimum_version,
      automationEnabled: updated.automation_enabled,
      reason: '',
    });
    setSuccessMessage('운영 설정을 저장하고 감사 기록을 남겼습니다.');
    setIsSaving(false);
  };

  const impacts = controls && draft ? describeOperationImpact(controls, draft) : [];
  const hasChanges = Boolean(controls && draft && hasOperationChanges(controls, draft));

  return (
    <>
      <header className="page-heading">
        <h1>운영 제어</h1>
        <p>사용자 프로그램의 최소 지원 버전과 자동 입력 운영 상태를 확인하고 변경합니다.</p>
      </header>

      {successMessage ? (
        <div className="message success-message operation-page-message" role="status">
          <CheckCircle2 aria-hidden="true" /><div><h2>운영 설정 저장 완료</h2><p>{successMessage}</p></div>
        </div>
      ) : null}
      {errorMessage ? (
        <div id="operation-error" className="message operation-page-message" role="alert" tabIndex={-1}>
          <AlertCircle aria-hidden="true" /><div><h2>운영 설정을 처리하지 못했습니다</h2><p>{errorMessage}</p></div>
        </div>
      ) : null}

      <section className="controls-panel" aria-labelledby="controls-heading" aria-busy={isLoading}>
        <div className="results-heading">
          <h2 id="controls-heading">현재 운영 상태</h2>
          <span>활성 회원 {controls?.active_member_count.toLocaleString('ko-KR') ?? '–'}명</span>
        </div>

        {isLoading ? (
          <div className="results-state" role="status">
            <LoaderCircle className="is-spinning" aria-hidden="true" />운영 상태를 불러오는 중…
          </div>
        ) : controls ? (
          <dl className="controls-list">
            <div>
              <dt>최소 지원 앱 버전</dt>
              <dd className="numeric-cell"><strong>{controls.minimum_version}</strong><small>이 버전보다 낮으면 생성과 자동 입력이 차단됩니다.</small></dd>
            </div>
            <div>
              <dt>자동 입력 상태</dt>
              <dd>
                <span className={`status-badge ${controls.automation_enabled ? 'success' : 'danger'}`}>
                  {controls.automation_enabled ? '사용 가능' : '긴급 중지'}
                </span>
                <small>{controls.automation_enabled ? '새 자동 입력 작업을 시작할 수 있습니다.' : '계정과 설정은 열리지만 새 자동 입력은 차단됩니다.'}</small>
              </dd>
            </div>
            <div>
              <dt>마지막 변경 시각</dt>
              <dd className="numeric-cell"><strong>{dateTimeFormatter.format(new Date(controls.updated_at))}</strong></dd>
            </div>
          </dl>
        ) : null}
      </section>

      {controls && draft ? (
        <section className="license-editor operation-editor" aria-labelledby="operation-editor-heading">
          <div className="license-editor-heading">
            <div>
              <h2 id="operation-editor-heading">운영 설정 변경</h2>
              <p>저장 전에 영향 범위를 확인하고 변경 사유를 기록합니다.</p>
            </div>
            <ShieldAlert aria-hidden="true" />
          </div>

          <form className="license-form" onSubmit={(event) => void saveControls(event)}>
            <div className="field-group operation-version-field">
              <label htmlFor="minimum-version">최소 지원 앱 버전 <span className="required-label">필수</span></label>
              <input
                id="minimum-version"
                type="text"
                value={draft.minimumVersion}
                pattern="[0-9]+[.][0-9]+[.][0-9]+"
                maxLength={20}
                required
                disabled={isSaving}
                aria-describedby="minimum-version-help"
                onChange={(event) => setDraft({ ...draft, minimumVersion: event.target.value })}
              />
              <p id="minimum-version-help" className="field-help">예: 0.1.0. 입력한 버전보다 낮은 앱은 생성과 자동 입력이 차단됩니다.</p>
            </div>

            <fieldset className="license-status-field">
              <legend>자동 입력 상태 <span className="required-label">필수</span></legend>
              <div className="license-status-options">
                <label>
                  <input
                    type="radio"
                    name="automation-status"
                    checked={draft.automationEnabled}
                    disabled={isSaving}
                    onChange={() => setDraft({ ...draft, automationEnabled: true })}
                  />
                  <span><strong>사용 가능</strong><small>회원이 새 자동 입력 작업을 시작할 수 있습니다.</small></span>
                </label>
                <label>
                  <input
                    type="radio"
                    name="automation-status"
                    checked={!draft.automationEnabled}
                    disabled={isSaving}
                    onChange={() => setDraft({ ...draft, automationEnabled: false })}
                  />
                  <span><strong>긴급 중지</strong><small>새 자동 입력만 차단하고 계정과 설정은 유지합니다.</small></span>
                </label>
              </div>
            </fieldset>

            <div className={`controls-note operation-impact ${hasChanges ? 'has-changes' : ''}`}>
              <ShieldAlert aria-hidden="true" />
              <div>
                <strong>저장 전 영향</strong>
                {impacts.length > 0
                  ? <ul>{impacts.map((impact) => <li key={impact}>{impact}</li>)}</ul>
                  : <p>아직 변경된 설정이 없습니다.</p>}
              </div>
            </div>

            <div className="field-group">
              <label htmlFor="operation-reason">변경 사유 <span className="required-label">필수</span></label>
              <textarea
                id="operation-reason"
                value={draft.reason}
                minLength={5}
                maxLength={500}
                required
                disabled={isSaving}
                aria-describedby="operation-reason-help"
                onChange={(event) => setDraft({ ...draft, reason: event.target.value })}
              />
              <p id="operation-reason-help" className="field-help">감사 기록에 남습니다. 5–500자로 입력해 주세요.</p>
            </div>

            <button className="button primary operation-save-button" type="submit" disabled={isSaving || !hasChanges}>
              {isSaving ? <LoaderCircle className="is-spinning" aria-hidden="true" /> : <Save aria-hidden="true" />}
              {isSaving ? '저장 중…' : '운영 설정 저장'}
            </button>
          </form>
        </section>
      ) : null}
    </>
  );
}

import {
  AlertCircle,
  CalendarClock,
  CheckCircle2,
  LoaderCircle,
  MonitorOff,
  Search,
  UserCheck,
  UsersRound,
} from 'lucide-react';
import { type FormEvent, useEffect, useState } from 'react';
import {
  getLicenseDisplayState,
  normalizeMemberSearch,
  resolveLicenseDateTime,
  toLocalDateTimeInput,
} from './member-view.js';
import { supabase } from './supabase.js';

type MemberSummary = {
  readonly user_id: string;
  readonly email: string | null;
  readonly admin_alias: string | null;
  readonly account_status: string;
  readonly created_at: string;
  readonly license_status: string | null;
  readonly license_starts_at: string | null;
  readonly license_ends_at: string | null;
  readonly device_registered_at: string | null;
  readonly device_changed_at: string | null;
};

type LicenseDraft = {
  readonly status: 'active' | 'inactive';
  readonly startsAt: string;
  readonly endsAt: string;
  readonly reason: string;
};

type AccountDraft = {
  readonly status: 'active' | 'suspended';
  readonly reason: string;
};

type SuccessNotice = {
  readonly title: string;
  readonly detail: string;
};

const dateFormatter = new Intl.DateTimeFormat('ko-KR', {
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

function formatDate(value: string | null): string {
  if (!value) return '없음';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '확인 필요' : dateFormatter.format(date);
}

function createLicenseDraft(member: MemberSummary): LicenseDraft {
  const now = new Date();
  const thirtyDaysLater = new Date(now);
  thirtyDaysLater.setDate(thirtyDaysLater.getDate() + 30);

  return {
    status: member.license_status === 'inactive' ? 'inactive' : 'active',
    startsAt: toLocalDateTimeInput(member.license_starts_at, now),
    endsAt: toLocalDateTimeInput(member.license_ends_at, thirtyDaysLater),
    reason: '',
  };
}

const licenseLabels = {
  active: '이용 중',
  expired: '기간 만료',
  inactive: '이용 중지',
  none: '이용권 없음',
} as const;

export function MembersScreen() {
  const [query, setQuery] = useState('');
  const [appliedQuery, setAppliedQuery] = useState<string | null>(null);
  const [members, setMembers] = useState<readonly MemberSummary[]>([]);
  const [selectedMember, setSelectedMember] = useState<MemberSummary | null>(null);
  const [licenseDraft, setLicenseDraft] = useState<LicenseDraft | null>(null);
  const [accountEditMember, setAccountEditMember] = useState<MemberSummary | null>(null);
  const [accountDraft, setAccountDraft] = useState<AccountDraft | null>(null);
  const [deviceResetMember, setDeviceResetMember] = useState<MemberSummary | null>(null);
  const [deviceResetReason, setDeviceResetReason] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [licenseErrorMessage, setLicenseErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<SuccessNotice | null>(null);
  const [actionErrorMessage, setActionErrorMessage] = useState<string | null>(null);

  const loadMembers = async (searchText: string | null): Promise<void> => {
    if (!supabase) return;

    setIsLoading(true);
    setErrorMessage(null);
    setSuccessMessage(null);
    setActionErrorMessage(null);
    setSelectedMember(null);
    setLicenseDraft(null);
    setAccountEditMember(null);
    setAccountDraft(null);
    setDeviceResetMember(null);
    setDeviceResetReason('');

    const { data, error } = await supabase.rpc('admin_search_members', {
      search_text: searchText,
      result_limit: 50,
    });

    if (error) {
      setMembers([]);
      setErrorMessage('회원 정보를 불러오지 못했습니다. 회원 조회 준비 SQL과 로그인 상태를 확인한 뒤 다시 시도해 주세요.');
    } else {
      setMembers((data ?? []) as MemberSummary[]);
      setAppliedQuery(searchText);
    }

    setIsLoading(false);
  };

  useEffect(() => {
    void loadMembers(null);
  }, []);

  useEffect(() => {
    if (selectedMember) document.getElementById('license-editor-heading')?.focus();
  }, [selectedMember]);

  useEffect(() => {
    if (licenseErrorMessage) document.getElementById('license-form-error')?.focus();
  }, [licenseErrorMessage]);

  useEffect(() => {
    if (actionErrorMessage) document.getElementById('member-action-error')?.focus();
  }, [actionErrorMessage]);

  useEffect(() => {
    if (deviceResetMember) document.getElementById('device-reset-heading')?.focus();
  }, [deviceResetMember]);

  useEffect(() => {
    if (accountEditMember) document.getElementById('account-editor-heading')?.focus();
  }, [accountEditMember]);

  const submit = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    void loadMembers(normalizeMemberSearch(query));
  };

  const showAll = (): void => {
    setQuery('');
    void loadMembers(null);
  };

  const beginLicenseEdit = (member: MemberSummary): void => {
    setSelectedMember(member);
    setLicenseDraft(createLicenseDraft(member));
    setAccountEditMember(null);
    setAccountDraft(null);
    setDeviceResetMember(null);
    setDeviceResetReason('');
    setLicenseErrorMessage(null);
    setSuccessMessage(null);
  };

  const cancelLicenseEdit = (): void => {
    setSelectedMember(null);
    setLicenseDraft(null);
    setLicenseErrorMessage(null);
  };

  const beginAccountEdit = (member: MemberSummary): void => {
    setSelectedMember(null);
    setLicenseDraft(null);
    setDeviceResetMember(null);
    setDeviceResetReason('');
    setAccountEditMember(member);
    setAccountDraft({
      status: member.account_status === 'suspended' ? 'suspended' : 'active',
      reason: '',
    });
    setActionErrorMessage(null);
    setSuccessMessage(null);
  };

  const cancelAccountEdit = (): void => {
    setAccountEditMember(null);
    setAccountDraft(null);
    setActionErrorMessage(null);
  };

  const beginDeviceReset = (member: MemberSummary): void => {
    setSelectedMember(null);
    setLicenseDraft(null);
    setAccountEditMember(null);
    setAccountDraft(null);
    setDeviceResetMember(member);
    setDeviceResetReason('');
    setActionErrorMessage(null);
    setSuccessMessage(null);
  };

  const cancelDeviceReset = (): void => {
    setDeviceResetMember(null);
    setDeviceResetReason('');
    setActionErrorMessage(null);
  };

  const saveLicense = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    if (!supabase || !selectedMember || !licenseDraft) return;

    const startsAt = resolveLicenseDateTime(licenseDraft.startsAt, selectedMember.license_starts_at);
    const endsAt = resolveLicenseDateTime(licenseDraft.endsAt, selectedMember.license_ends_at);
    const reason = licenseDraft.reason.trim();

    if (!startsAt || !endsAt || Date.parse(endsAt) <= Date.parse(startsAt)) {
      setLicenseErrorMessage('종료 일시는 시작 일시보다 뒤여야 합니다.');
      return;
    }

    if (reason.length < 5) {
      setLicenseErrorMessage('변경 사유를 5자 이상 입력해 주세요.');
      return;
    }

    if (
      licenseDraft.status === 'inactive'
      && !window.confirm('이 회원의 이용권을 비활성화합니다. 계속할까요?')
    ) {
      return;
    }

    setIsSaving(true);
    setLicenseErrorMessage(null);

    const { error } = await supabase.rpc('admin_set_member_license', {
      target_user_id: selectedMember.user_id,
      next_status: licenseDraft.status,
      next_starts_at: startsAt,
      next_ends_at: endsAt,
      change_reason: reason,
    });

    if (error) {
      setLicenseErrorMessage('이용권을 변경하지 못했습니다. 이용권 관리 SQL과 추가 인증 상태를 확인한 뒤 다시 시도해 주세요.');
      setIsSaving(false);
      return;
    }

    const changedEmail = selectedMember.email ?? '선택한 회원';
    await loadMembers(appliedQuery);
    setSuccessMessage({
      title: '이용권 변경 완료',
      detail: `${changedEmail}의 이용권을 변경하고 감사 기록을 남겼습니다.`,
    });
    setIsSaving(false);
  };

  const saveAccountStatus = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    if (!supabase || !accountEditMember || !accountDraft) return;

    const reason = accountDraft.reason.trim();
    if (reason.length < 5 || reason.length > 500) {
      setActionErrorMessage('계정 상태 변경 사유를 5–500자로 입력해 주세요.');
      return;
    }

    if (accountDraft.status === accountEditMember.account_status) {
      setActionErrorMessage('변경할 계정 상태를 선택해 주세요.');
      return;
    }

    const memberName = accountEditMember.email ?? '선택한 회원';
    if (
      accountDraft.status === 'suspended'
      && !window.confirm(`${memberName}의 계정을 정지합니다.\n\n열린 BLOW 사용자 프로그램도 즉시 차단됩니다. 계속할까요?`)
    ) {
      return;
    }

    setIsSaving(true);
    setActionErrorMessage(null);
    setSuccessMessage(null);

    const { error } = await supabase.rpc('admin_set_member_account_status', {
      target_user_id: accountEditMember.user_id,
      next_status: accountDraft.status,
      change_reason: reason,
    });

    if (error) {
      setActionErrorMessage('계정 상태를 변경하지 못했습니다. 계정 관리 SQL과 추가 인증 상태를 확인한 뒤 다시 시도해 주세요.');
      setIsSaving(false);
      return;
    }

    const nextStatusLabel = accountDraft.status === 'active' ? '정상' : '정지';
    await loadMembers(appliedQuery);
    setSuccessMessage({
      title: '계정 상태 변경 완료',
      detail: `${memberName}의 계정을 ${nextStatusLabel} 상태로 변경하고 감사 기록을 남겼습니다.`,
    });
    setIsSaving(false);
  };

  const resetDevice = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    if (!supabase || !deviceResetMember?.device_registered_at) return;

    const reason = deviceResetReason.trim();
    if (reason.length < 5 || reason.length > 500) {
      setActionErrorMessage('등록 PC 해제 사유를 5–500자로 입력해 주세요.');
      return;
    }

    const memberName = deviceResetMember.email ?? '선택한 회원';
    if (!window.confirm(
      `${memberName}의 등록 PC를 해제합니다.\n\n계정과 이용권은 유지되며, 다음 로그인한 PC가 새 등록 PC가 됩니다. 계속할까요?`,
    )) {
      return;
    }

    setIsSaving(true);
    setActionErrorMessage(null);
    setSuccessMessage(null);

    const { error } = await supabase.rpc('admin_reset_member_device', {
      target_user_id: deviceResetMember.user_id,
      change_reason: reason,
    });

    if (error) {
      setActionErrorMessage('등록 PC를 해제하지 못했습니다. 기기 변경 SQL과 추가 인증 상태를 확인한 뒤 다시 시도해 주세요.');
      setIsSaving(false);
      return;
    }

    await loadMembers(appliedQuery);
    setSuccessMessage({
      title: '등록 PC 해제 완료',
      detail: `${memberName}의 기존 PC 등록을 해제했습니다. 다음 로그인한 PC가 새 등록 PC로 등록됩니다.`,
    });
    setIsSaving(false);
  };

  return (
    <>
      <header className="page-heading">
        <h1>회원 조회</h1>
        <p>이메일, 관리자 별칭 또는 회원 ID로 계정·이용권·등록 PC 상태를 확인합니다.</p>
      </header>

      <section className="member-search-panel" aria-labelledby="member-search-heading">
        <h2 id="member-search-heading">회원 검색</h2>
        <form className="member-search-form" onSubmit={submit}>
          <div className="field-group member-search-field">
            <label htmlFor="member-search">검색어 <span className="required-label">선택</span></label>
            <input
              id="member-search"
              type="search"
              value={query}
              maxLength={100}
              placeholder="이메일, 별칭 또는 회원 ID"
              disabled={isLoading || isSaving}
              onChange={(event) => setQuery(event.target.value)}
            />
          </div>
          <button className="button primary search-button" type="submit" disabled={isLoading || isSaving}>
            {isLoading ? <LoaderCircle className="is-spinning" aria-hidden="true" /> : <Search aria-hidden="true" />}
            {isLoading ? '조회 중…' : '검색'}
          </button>
          {appliedQuery ? (
            <button className="button secondary" type="button" disabled={isLoading || isSaving} onClick={showAll}>전체 보기</button>
          ) : null}
        </form>
        <p className="field-help">검색어가 없으면 최근 가입 순으로 최대 50명을 표시합니다.</p>
      </section>

      {errorMessage ? (
        <div className="message member-message" role="alert">
          <AlertCircle aria-hidden="true" />
          <div><h2>회원 조회를 완료하지 못했습니다</h2><p>{errorMessage}</p></div>
        </div>
      ) : null}

      {actionErrorMessage ? (
        <div id="member-action-error" className="message member-message" role="alert" tabIndex={-1}>
          <AlertCircle aria-hidden="true" />
          <div><h2>회원 관리 작업을 완료하지 못했습니다</h2><p>{actionErrorMessage}</p></div>
        </div>
      ) : null}

      {successMessage ? (
        <div className="message success-message member-message" role="status">
          <CheckCircle2 aria-hidden="true" />
          <div><h2>{successMessage.title}</h2><p>{successMessage.detail}</p></div>
        </div>
      ) : null}

      {accountEditMember && accountDraft ? (
        <section id="account-editor" className="license-editor" aria-labelledby="account-editor-heading">
          <header className="license-editor-heading">
            <div>
              <h2 id="account-editor-heading" tabIndex={-1}>계정 상태 변경</h2>
              <p><strong>{accountEditMember.email ?? '이메일 없음'}</strong><span className="member-id">{accountEditMember.user_id}</span></p>
            </div>
            <UserCheck aria-hidden="true" />
          </header>

          <form className="license-form" onSubmit={(event) => void saveAccountStatus(event)}>
            <fieldset className="license-status-field" disabled={isSaving}>
              <legend>계정 상태 <span className="required-label">필수</span></legend>
              <div className="license-status-options">
                <label>
                  <input
                    type="radio"
                    name="account-status"
                    value="active"
                    checked={accountDraft.status === 'active'}
                    onChange={() => {
                      setAccountDraft({ ...accountDraft, status: 'active' });
                      setActionErrorMessage(null);
                    }}
                  />
                  <span><strong>정상</strong><small>이용권과 등록 PC 조건을 충족하면 프로그램을 사용할 수 있습니다.</small></span>
                </label>
                <label>
                  <input
                    type="radio"
                    name="account-status"
                    value="suspended"
                    checked={accountDraft.status === 'suspended'}
                    onChange={() => {
                      setAccountDraft({ ...accountDraft, status: 'suspended' });
                      setActionErrorMessage(null);
                    }}
                  />
                  <span><strong>정지</strong><small>열린 사용자 프로그램을 즉시 차단하지만 이용권 기간은 변경하지 않습니다.</small></span>
                </label>
              </div>
            </fieldset>

            <div className="field-group">
              <label htmlFor="account-status-reason">변경 사유 <span className="required-label">필수</span></label>
              <textarea
                id="account-status-reason"
                rows={3}
                minLength={5}
                maxLength={500}
                value={accountDraft.reason}
                disabled={isSaving}
                required
                aria-describedby="account-status-reason-help"
                onChange={(event) => {
                  setAccountDraft({ ...accountDraft, reason: event.target.value });
                  setActionErrorMessage(null);
                }}
              />
              <p id="account-status-reason-help" className="field-help">감사 기록에 남습니다. 5–500자로 입력해 주세요.</p>
            </div>

            <div className="button-row">
              <button
                className={`button ${accountDraft.status === 'suspended' ? 'danger' : 'primary'}`}
                type="submit"
                disabled={isSaving || accountDraft.status === accountEditMember.account_status}
              >
                {isSaving ? <LoaderCircle className="is-spinning" aria-hidden="true" /> : <UserCheck aria-hidden="true" />}
                {isSaving ? '변경 중…' : accountDraft.status === 'suspended' ? '계정 정지' : '정지 해제'}
              </button>
              <button className="button secondary" type="button" disabled={isSaving} onClick={cancelAccountEdit}>취소</button>
            </div>
          </form>
        </section>
      ) : null}

      {deviceResetMember ? (
        <section id="device-reset-editor" className="license-editor" aria-labelledby="device-reset-heading">
          <header className="license-editor-heading">
            <div>
              <h2 id="device-reset-heading" tabIndex={-1}>등록 PC 해제</h2>
              <p><strong>{deviceResetMember.email ?? '이메일 없음'}</strong><span className="member-id">{deviceResetMember.user_id}</span></p>
            </div>
            <MonitorOff aria-hidden="true" />
          </header>

          <form className="license-form" onSubmit={(event) => void resetDevice(event)}>
            <div className="controls-note">
              <MonitorOff aria-hidden="true" />
              <p>현재 PC 등록만 해제합니다. 계정과 이용권은 유지되며, 다음 로그인한 PC가 새 등록 PC가 됩니다.</p>
            </div>

            <div className="field-group">
              <label htmlFor="device-reset-reason">해제 사유 <span className="required-label">필수</span></label>
              <textarea
                id="device-reset-reason"
                rows={3}
                minLength={5}
                maxLength={500}
                value={deviceResetReason}
                disabled={isSaving}
                required
                autoFocus
                aria-describedby="device-reset-reason-help"
                onChange={(event) => {
                  setDeviceResetReason(event.target.value);
                  setActionErrorMessage(null);
                }}
              />
              <p id="device-reset-reason-help" className="field-help">감사 기록에 남습니다. 5–500자로 입력해 주세요.</p>
            </div>

            <div className="button-row">
              <button className="button danger" type="submit" disabled={isSaving}>
                {isSaving ? <LoaderCircle className="is-spinning" aria-hidden="true" /> : <MonitorOff aria-hidden="true" />}
                {isSaving ? '해제 중…' : '등록 PC 해제'}
              </button>
              <button className="button secondary" type="button" disabled={isSaving} onClick={cancelDeviceReset}>취소</button>
            </div>
          </form>
        </section>
      ) : null}

      {selectedMember && licenseDraft ? (
        <section id="license-editor" className="license-editor" aria-labelledby="license-editor-heading">
          <header className="license-editor-heading">
            <div>
              <h2 id="license-editor-heading" tabIndex={-1}>이용권 변경</h2>
              <p><strong>{selectedMember.email ?? '이메일 없음'}</strong><span className="member-id">{selectedMember.user_id}</span></p>
            </div>
            <CalendarClock aria-hidden="true" />
          </header>

          <form className="license-form" onSubmit={(event) => void saveLicense(event)}>
            <fieldset className="license-status-field" disabled={isSaving}>
              <legend>이용 상태 <span className="required-label">필수</span></legend>
              <div className="license-status-options">
                <label>
                  <input
                    type="radio"
                    name="license-status"
                    value="active"
                    checked={licenseDraft.status === 'active'}
                    onChange={() => setLicenseDraft({ ...licenseDraft, status: 'active' })}
                  />
                  <span><strong>활성</strong><small>설정한 기간 동안 프로그램을 사용할 수 있습니다.</small></span>
                </label>
                <label>
                  <input
                    type="radio"
                    name="license-status"
                    value="inactive"
                    checked={licenseDraft.status === 'inactive'}
                    onChange={() => setLicenseDraft({ ...licenseDraft, status: 'inactive' })}
                  />
                  <span><strong>비활성</strong><small>기간이 남아 있어도 프로그램 사용을 중지합니다.</small></span>
                </label>
              </div>
            </fieldset>

            <div className="license-date-fields">
              <div className="field-group">
                <label htmlFor="license-starts-at">시작 일시 <span className="required-label">필수</span></label>
                <input
                  id="license-starts-at"
                  type="datetime-local"
                  step="60"
                  value={licenseDraft.startsAt}
                  disabled={isSaving}
                  required
                  onChange={(event) => setLicenseDraft({ ...licenseDraft, startsAt: event.target.value })}
                />
              </div>
              <div className="field-group">
                <label htmlFor="license-ends-at">종료 일시 <span className="required-label">필수</span></label>
                <input
                  id="license-ends-at"
                  type="datetime-local"
                  step="60"
                  value={licenseDraft.endsAt}
                  disabled={isSaving}
                  required
                  onChange={(event) => setLicenseDraft({ ...licenseDraft, endsAt: event.target.value })}
                />
              </div>
            </div>

            <div className="field-group">
              <label htmlFor="license-reason">변경 사유 <span className="required-label">필수</span></label>
              <textarea
                id="license-reason"
                rows={3}
                minLength={5}
                maxLength={500}
                value={licenseDraft.reason}
                disabled={isSaving}
                required
                aria-describedby="license-reason-help"
                onChange={(event) => setLicenseDraft({ ...licenseDraft, reason: event.target.value })}
              />
              <p id="license-reason-help" className="field-help">감사 기록에 남습니다. 5–500자로 입력해 주세요.</p>
            </div>

            {licenseErrorMessage ? (
              <div id="license-form-error" className="message license-form-message" role="alert" tabIndex={-1}>
                <AlertCircle aria-hidden="true" />
                <div><h2>이용권을 변경하지 못했습니다</h2><p>{licenseErrorMessage}</p></div>
              </div>
            ) : null}

            <div className="button-row">
              <button
                className={`button ${licenseDraft.status === 'inactive' ? 'danger' : 'primary'}`}
                type="submit"
                disabled={isSaving}
              >
                {isSaving ? <LoaderCircle className="is-spinning" aria-hidden="true" /> : null}
                {isSaving ? '저장 중…' : licenseDraft.status === 'inactive' ? '이용권 비활성화' : '이용권 저장'}
              </button>
              <button className="button secondary" type="button" disabled={isSaving} onClick={cancelLicenseEdit}>취소</button>
            </div>
          </form>
        </section>
      ) : null}

      <section className="member-results" aria-labelledby="member-results-heading" aria-busy={isLoading}>
        <div className="results-heading">
          <h2 id="member-results-heading">조회 결과</h2>
          <span aria-live="polite">{isLoading ? '불러오는 중' : `${members.length.toLocaleString('ko-KR')}명`}</span>
        </div>

        {isLoading ? (
          <div className="results-state"><LoaderCircle className="is-spinning" aria-hidden="true" />회원 정보를 불러오고 있습니다.</div>
        ) : members.length === 0 && !errorMessage ? (
          <div className="results-state empty-state">
            <UsersRound aria-hidden="true" />
            <div><h2>일치하는 회원이 없습니다</h2><p>이메일 일부만 입력하거나 전체 보기를 눌러 다시 확인해 주세요.</p></div>
          </div>
        ) : members.length > 0 ? (
          <div className="table-scroll" tabIndex={0} aria-label="회원 조회 결과 표">
            <table>
              <thead>
                <tr><th scope="col">회원</th><th scope="col">별칭</th><th scope="col">계정</th><th scope="col">이용권</th><th scope="col">등록 PC</th><th scope="col">가입일</th><th scope="col">관리</th></tr>
              </thead>
              <tbody>
                {members.map((member) => {
                  const licenseState = getLicenseDisplayState(member.license_status, member.license_ends_at, Date.now());
                  const isAccountSelected = accountEditMember?.user_id === member.user_id;
                  const isLicenseSelected = selectedMember?.user_id === member.user_id;
                  const isDeviceSelected = deviceResetMember?.user_id === member.user_id;
                  const isSelected = isAccountSelected || isLicenseSelected || isDeviceSelected;
                  return (
                    <tr key={member.user_id} className={isSelected ? 'is-selected' : undefined}>
                      <td data-label="회원"><strong>{member.email ?? '이메일 없음'}</strong><small className="member-id">{member.user_id}</small></td>
                      <td data-label="별칭">{member.admin_alias ?? '미설정'}</td>
                      <td data-label="계정"><span className={`status-badge ${member.account_status === 'active' ? 'success' : 'danger'}`}>{member.account_status === 'active' ? '정상' : '정지'}</span></td>
                      <td data-label="이용권"><span className={`status-badge ${licenseState === 'active' ? 'success' : 'neutral'}`}>{licenseLabels[licenseState]}</span><small>{member.license_ends_at ? `${formatDate(member.license_ends_at)}까지` : '종료일 없음'}</small></td>
                      <td data-label="등록 PC"><span className={`status-badge ${member.device_registered_at ? 'success' : 'neutral'}`}>{member.device_registered_at ? '등록' : '미등록'}</span><small>{member.device_registered_at ? `${formatDate(member.device_changed_at)} 확인` : '등록 기록 없음'}</small></td>
                      <td data-label="가입일" className="numeric-cell">{formatDate(member.created_at)}</td>
                      <td data-label="관리">
                        <div className="table-action-group">
                          <button
                            className="button secondary table-action-button"
                            type="button"
                            aria-expanded={isAccountSelected}
                            aria-controls={isAccountSelected ? 'account-editor' : undefined}
                            disabled={isLoading || isSaving}
                            onClick={() => beginAccountEdit(member)}
                          >
                            계정 관리
                          </button>
                          <button
                            className="button secondary table-action-button"
                            type="button"
                            aria-expanded={isLicenseSelected}
                            aria-controls={isLicenseSelected ? 'license-editor' : undefined}
                            disabled={isLoading || isSaving}
                            onClick={() => beginLicenseEdit(member)}
                          >
                            이용권 관리
                          </button>
                          {member.device_registered_at ? (
                            <button
                              className="button danger table-action-button"
                              type="button"
                              aria-expanded={isDeviceSelected}
                              aria-controls={isDeviceSelected ? 'device-reset-editor' : undefined}
                              disabled={isLoading || isSaving}
                              onClick={() => beginDeviceReset(member)}
                            >
                              <MonitorOff aria-hidden="true" />등록 PC 해제
                            </button>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : null}
      </section>
    </>
  );
}

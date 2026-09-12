import {
  AlertCircle,
  CalendarClock,
  CheckCircle2,
  LoaderCircle,
  Search,
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
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [licenseErrorMessage, setLicenseErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const loadMembers = async (searchText: string | null): Promise<void> => {
    if (!supabase) return;

    setIsLoading(true);
    setErrorMessage(null);
    setSuccessMessage(null);
    setSelectedMember(null);
    setLicenseDraft(null);

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
    setLicenseErrorMessage(null);
    setSuccessMessage(null);
  };

  const cancelLicenseEdit = (): void => {
    setSelectedMember(null);
    setLicenseDraft(null);
    setLicenseErrorMessage(null);
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
    setSuccessMessage(`${changedEmail}의 이용권을 변경하고 감사 기록을 남겼습니다.`);
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

      {successMessage ? (
        <div className="message success-message member-message" role="status">
          <CheckCircle2 aria-hidden="true" />
          <div><h2>이용권 변경 완료</h2><p>{successMessage}</p></div>
        </div>
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
                  const isSelected = selectedMember?.user_id === member.user_id;
                  return (
                    <tr key={member.user_id} className={isSelected ? 'is-selected' : undefined}>
                      <td data-label="회원"><strong>{member.email ?? '이메일 없음'}</strong><small className="member-id">{member.user_id}</small></td>
                      <td data-label="별칭">{member.admin_alias ?? '미설정'}</td>
                      <td data-label="계정"><span className={`status-badge ${member.account_status === 'active' ? 'success' : 'danger'}`}>{member.account_status === 'active' ? '정상' : '정지'}</span></td>
                      <td data-label="이용권"><span className={`status-badge ${licenseState === 'active' ? 'success' : 'neutral'}`}>{licenseLabels[licenseState]}</span><small>{member.license_ends_at ? `${formatDate(member.license_ends_at)}까지` : '종료일 없음'}</small></td>
                      <td data-label="등록 PC"><span className={`status-badge ${member.device_registered_at ? 'success' : 'neutral'}`}>{member.device_registered_at ? '등록' : '미등록'}</span><small>{member.device_registered_at ? `${formatDate(member.device_changed_at)} 확인` : '등록 기록 없음'}</small></td>
                      <td data-label="가입일" className="numeric-cell">{formatDate(member.created_at)}</td>
                      <td data-label="관리">
                        <button
                          className="button secondary table-action-button"
                          type="button"
                          aria-expanded={isSelected}
                          aria-controls={isSelected ? 'license-editor' : undefined}
                          disabled={isLoading || isSaving}
                          onClick={() => beginLicenseEdit(member)}
                        >
                          이용권 관리
                        </button>
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

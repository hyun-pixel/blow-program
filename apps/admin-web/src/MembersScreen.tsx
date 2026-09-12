import { AlertCircle, LoaderCircle, Search, UsersRound } from 'lucide-react';
import { type FormEvent, useEffect, useState } from 'react';
import { getLicenseDisplayState, normalizeMemberSearch } from './member-view.js';
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
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const loadMembers = async (searchText: string | null): Promise<void> => {
    if (!supabase) return;

    setIsLoading(true);
    setErrorMessage(null);

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

  const submit = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    void loadMembers(normalizeMemberSearch(query));
  };

  const showAll = (): void => {
    setQuery('');
    void loadMembers(null);
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
              disabled={isLoading}
              onChange={(event) => setQuery(event.target.value)}
            />
          </div>
          <button className="button primary search-button" type="submit" disabled={isLoading}>
            {isLoading ? <LoaderCircle className="is-spinning" aria-hidden="true" /> : <Search aria-hidden="true" />}
            {isLoading ? '조회 중…' : '검색'}
          </button>
          {appliedQuery ? (
            <button className="button secondary" type="button" disabled={isLoading} onClick={showAll}>전체 보기</button>
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
                <tr><th scope="col">회원</th><th scope="col">별칭</th><th scope="col">계정</th><th scope="col">이용권</th><th scope="col">등록 PC</th><th scope="col">가입일</th></tr>
              </thead>
              <tbody>
                {members.map((member) => {
                  const licenseState = getLicenseDisplayState(member.license_status, member.license_ends_at, Date.now());
                  return (
                    <tr key={member.user_id}>
                      <td data-label="회원"><strong>{member.email ?? '이메일 없음'}</strong><small className="member-id">{member.user_id}</small></td>
                      <td data-label="별칭">{member.admin_alias ?? '미설정'}</td>
                      <td data-label="계정"><span className={`status-badge ${member.account_status === 'active' ? 'success' : 'danger'}`}>{member.account_status === 'active' ? '정상' : '정지'}</span></td>
                      <td data-label="이용권"><span className={`status-badge ${licenseState === 'active' ? 'success' : 'neutral'}`}>{licenseLabels[licenseState]}</span><small>{member.license_ends_at ? `${formatDate(member.license_ends_at)}까지` : '종료일 없음'}</small></td>
                      <td data-label="등록 PC"><span className={`status-badge ${member.device_registered_at ? 'success' : 'neutral'}`}>{member.device_registered_at ? '등록' : '미등록'}</span><small>{member.device_registered_at ? `${formatDate(member.device_changed_at)} 확인` : '등록 기록 없음'}</small></td>
                      <td data-label="가입일" className="numeric-cell">{formatDate(member.created_at)}</td>
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
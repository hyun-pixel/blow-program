import { AlertCircle, History, LoaderCircle } from 'lucide-react';
import { useEffect, useState } from 'react';
import {
  formatAuditAction,
  formatAuditDateTime,
  formatAuditTarget,
  formatAuditValue,
} from './audit-view.js';
import { supabase } from './supabase.js';

type AuditLog = {
  readonly id: string;
  readonly action: string;
  readonly actor_user_id: string;
  readonly target_user_id: string | null;
  readonly before_value: unknown;
  readonly after_value: unknown;
  readonly reason: string | null;
  readonly created_at: string;
};

export function AuditLogsScreen({ currentAdminId }: { readonly currentAdminId: string }) {
  const [logs, setLogs] = useState<readonly AuditLog[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    const loadLogs = async (): Promise<void> => {
      if (!supabase) return;

      const { data, error } = await supabase
        .from('admin_audit_logs')
        .select('id, action, actor_user_id, target_user_id, before_value, after_value, reason, created_at')
        .in('action', ['license.updated', 'app_controls.updated', 'device.registration_reset', 'account.status_updated'])
        .order('created_at', { ascending: false })
        .limit(50);

      if (cancelled) return;

      if (error) {
        setErrorMessage('변경 기록을 불러오지 못했습니다. 추가 인증 상태를 확인한 뒤 다시 로그인해 주세요.');
      } else {
        setLogs((data ?? []) as AuditLog[]);
      }
      setIsLoading(false);
    };

    void loadLogs();
    return () => { cancelled = true; };
  }, []);

  return (
    <>
      <header className="page-heading">
        <h1>관리자 변경 기록</h1>
        <p>계정, 이용권, 등록 PC와 운영 설정의 이전 값, 새 값과 변경 사유를 최근 순서로 확인합니다.</p>
      </header>

      <section className="member-results audit-results" aria-labelledby="audit-results-heading" aria-busy={isLoading}>
        <div className="results-heading">
          <h2 id="audit-results-heading">최근 변경</h2>
          <span>최대 50건</span>
        </div>

        {isLoading ? (
          <div className="results-state" role="status">
            <LoaderCircle className="is-spinning" aria-hidden="true" />변경 기록을 불러오는 중…
          </div>
        ) : errorMessage ? (
          <div className="message member-message" role="alert">
            <AlertCircle aria-hidden="true" />
            <div><h2>변경 기록을 불러오지 못했습니다</h2><p>{errorMessage}</p></div>
          </div>
        ) : logs.length === 0 ? (
          <div className="results-state empty-state">
            <History aria-hidden="true" />아직 관리자 변경 기록이 없습니다.
          </div>
        ) : (
          <div className="table-scroll">
            <table className="audit-table">
              <thead>
                <tr>
                  <th scope="col">변경 시각</th>
                  <th scope="col">관리자</th>
                  <th scope="col">변경 항목</th>
                  <th scope="col">대상</th>
                  <th scope="col">변경 전</th>
                  <th scope="col">변경 후</th>
                  <th scope="col">변경 사유</th>
                </tr>
              </thead>
              <tbody>
                {logs.map((log) => {
                  const before = formatAuditValue(log.action, log.before_value);
                  const after = formatAuditValue(log.action, log.after_value);

                  return (
                    <tr key={log.id}>
                      <td className="numeric-cell" data-label="변경 시각">{formatAuditDateTime(log.created_at)}</td>
                      <td className="audit-identity" data-label="관리자">
                        <strong>{log.actor_user_id === currentAdminId ? '본인' : '관리자'}</strong>
                        <small>{log.actor_user_id}</small>
                      </td>
                      <td data-label="변경 항목"><strong>{formatAuditAction(log.action)}</strong></td>
                      <td className="member-id" data-label="대상">{formatAuditTarget(log.action, log.target_user_id)}</td>
                      <td className="audit-value" data-label="변경 전"><strong>{before.title}</strong><small>{before.detail}</small></td>
                      <td className="audit-value" data-label="변경 후"><strong>{after.title}</strong><small>{after.detail}</small></td>
                      <td className="audit-reason" data-label="변경 사유">{log.reason ?? '기록 없음'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}




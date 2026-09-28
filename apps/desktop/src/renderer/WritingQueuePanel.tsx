import { useEffect, useRef } from 'react';
import type { WritingJob } from './writing-queue.js';

const statusLabels = { queued: '대기', running: '진행 중', saved: '저장 완료', failed: '확인 필요', interrupted: '중단됨' } as const;

export function WritingQueuePanel({ jobs, busy, disabled, stopping, error, confirmation, onConfirmStart, onCancelStart, onStart, onStop, onEdit, onRemove, onReview }: {
  readonly jobs: readonly WritingJob[];
  readonly busy: boolean;
  readonly disabled: boolean;
  readonly stopping: boolean;
  readonly error: string | null;
  readonly confirmation: readonly WritingJob[] | null;
  readonly onConfirmStart: () => void;
  readonly onCancelStart: () => void;
  readonly onStart: () => void;
  readonly onStop: () => void;
  readonly onEdit: (job: WritingJob) => void;
  readonly onRemove: (id: string) => void;
  readonly onReview: () => void;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = dialogRef.current;
    if (confirmation && !dialog?.open) dialog?.showModal();
    else if (!confirmation && dialog?.open) dialog.close();
  }, [confirmation]);
  const pending = jobs.filter(({ status }) => status === 'queued').length;
  const saved = jobs.filter(({ status }) => status === 'saved').length;
  return (
    <section className="writing-queue compose-section" aria-labelledby="writing-queue-heading" id="writing-queue">
      <dialog ref={dialogRef} className="queue-confirmation" aria-labelledby="queue-confirmation-title" aria-describedby="queue-confirmation-summary queue-confirmation-cost" onCancel={onCancelStart}>
        <h2 id="queue-confirmation-title">자동 작성을 시작할까요?</h2>
        <p id="queue-confirmation-summary">글 {confirmation?.length ?? 0}개 · AI 이미지 {confirmation?.reduce((sum, { config }) => sum + (config.images.enabled ? config.images.count : 0), 0) ?? 0}장을 작성하고 네이버에 임시저장합니다.</p>
        <p id="queue-confirmation-cost"><strong>본인의 OpenAI API 사용료가 발생합니다.</strong> 최종 발행은 하지 않습니다.</p>
        <p>BLOW를 맨 앞으로 두고 작업 중에는 PC를 조작하거나 절전·종료하지 마세요. 오류가 나면 다음 글도 멈춥니다.</p>
        <p>저장 후 내용·이미지의 사실관계와 사용 권한을 직접 확인해 주세요.</p>
        <div className="queue-actions">
          <button className="button secondary" type="button" autoFocus onClick={onCancelStart}>취소</button>
          <button className="button primary" type="button" disabled={busy} onClick={onConfirmStart}>자동 작성 시작</button>
        </div>
      </dialog>
      <header className="compose-section-heading">
        <div><h2 id="writing-queue-heading">자동 작성 목록</h2>
          <p>글마다 설정을 담은 뒤 한 번에 시작하세요. 한 글씩 작성·검사·임시저장하고 다음 글로 넘어갑니다.</p></div>
      </header>
      <div className="compose-section-body">
        <p className="queue-summary" role="status" aria-live="polite">전체 {jobs.length}개 · 대기 {pending}개 · 저장 완료 {saved}개{stopping ? ' · 현재 요청 종료를 기다리는 중…' : ''}</p>
        {error ? <p className="field-error" role="alert">{error}</p> : null}
        <div className="queue-actions">
          {busy ? <button className="button danger" type="button" disabled={stopping} onClick={onStop}>{stopping ? '중단 요청됨…' : '자동 작성 중단'}</button>
            : <button className="button primary" type="button" disabled={disabled || !pending} onClick={onStart}>목록 전체 자동 작성·저장 ({pending}개)</button>}
          {saved > 0 ? <button className="button secondary" type="button" disabled={busy} onClick={onReview}>저장한 글 확인</button> : null}
        </div>
        {jobs.length ? <ol className="queue-list">{jobs.map((job, index) => (
          <li className={`queue-job is-${job.status}`} key={job.id}>
            <div className="queue-job-heading"><h3>{index + 1}. {job.config.request.topic}</h3><span className="queue-status">{statusLabels[job.status]}</span></div>
            <p>{job.config.request.targetLength.toLocaleString('ko-KR')}자 · {job.config.modelName} · {job.config.request.articleType} · {job.config.blogId}</p>
            <p>이미지 {job.config.images.enabled ? job.config.images.count : 0}장 · 인용구 {job.config.decorations.quote.enabled ? job.config.decorations.quote.count : 0}회 · 스티커 {job.config.decorations.sticker.enabled ? job.config.decorations.sticker.count : 0}회 · 구분선 {job.config.decorations.divider.enabled ? job.config.decorations.divider.count : 0}회</p>
            <p className="queue-job-message" role={job.status === 'running' ? 'status' : undefined}>{job.message}</p>
            {job.draft ? <p>제목: {job.draft.title}</p> : null}
            {job.draft && (job.status === 'failed' || job.status === 'interrupted') ? <details><summary>중단된 글의 생성 내용 확인</summary><p className="queue-recovery-text">{job.draft.body}</p></details> : null}
            {!busy ? <div className="queue-job-actions">
              {job.status === 'queued' ? <button className="button secondary" type="button" disabled={disabled} onClick={() => onEdit(job)}>설정 수정</button> : null}
              <button className="button secondary" type="button" disabled={disabled} onClick={() => {
                if (window.confirm('이 항목을 BLOW 작성 목록에서만 삭제할까요? 네이버에 저장된 글과 작업 내역은 삭제하지 않습니다.')) onRemove(job.id);
              }}>목록에서 삭제</button>
            </div> : null}
          </li>
        ))}</ol> : <p className="queue-empty">아래에서 첫 글을 설정하세요. 여러 글은 ‘목록에 추가’로 차례대로 담을 수 있습니다.</p>}
        <p className="field-help">최대 20개 · 이 PC의 현재 계정에 주제·설정·생성된 글·진행 상황을 보관합니다. API 키와 생성 이미지는 목록에 보관하지 않습니다. 중단·실패·완료 항목은 자동 재실행하지 않습니다.</p>
        <p className="field-help">임시저장까지만 자동 실행합니다. 최종 발행 전에 네이버에서 사실관계·가격·표현·이미지 사용 권한을 확인하세요. PC 종료·절전 중에는 실행되지 않습니다.</p>
      </div>
    </section>
  );
}

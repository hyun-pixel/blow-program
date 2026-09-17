import {
  CheckCircle2,
  ExternalLink,
  FileClock,
  LoaderCircle,
  Trash2,
  XCircle,
} from 'lucide-react';
import { Fragment, useEffect, useState } from 'react';
import type { WorkHistoryEntry } from '../main/work-history.js';

function formatCreatedAt(value: string): string {
  return new Intl.DateTimeFormat('ko-KR', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value));
}

export function WorkHistoryScreen({
  userId,
  onCreateNew,
}: {
  readonly userId: string;
  readonly onCreateNew: () => void;
}) {
  const [entries, setEntries] = useState<readonly WorkHistoryEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [openingId, setOpeningId] = useState<string | null>(null);
  const [openNotice, setOpenNotice] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    setIsLoading(true);
    setErrorMessage(null);

    void window.blowWorkHistory.list(userId).then((response) => {
      if (!active) return;

      if (response.ok) {
        setEntries(response.entries);
      } else {
        setErrorMessage(response.error.message);
      }
      setIsLoading(false);
    });

    return () => {
      active = false;
    };
  }, [userId]);

  const removeEntry = async (entry: WorkHistoryEntry): Promise<void> => {
    if (!window.confirm(`‘${entry.title}’ 작업 내역을 이 PC에서 삭제할까요? 삭제 후 복구할 수 없습니다.`)) {
      return;
    }

    setDeletingId(entry.id);
    setErrorMessage(null);
    const response = await window.blowWorkHistory.remove(userId, entry.id);

    if (response.ok) {
      setEntries(response.entries);
      setExpandedId((current) => current === entry.id ? null : current);
    } else {
      setErrorMessage(response.error.message);
    }
    setDeletingId(null);
  };

  const openDraft = async (entry: WorkHistoryEntry): Promise<void> => {
    setOpeningId(entry.id);
    setErrorMessage(null);
    setOpenNotice(null);
    const response = await window.blowWorkHistory.openDraft(userId, entry.id);

    if (response.ok) {
      setOpenNotice(response.result.message);
    } else {
      setErrorMessage(response.error.message);
    }
    setOpeningId(null);
  };

  return (
    <>
      <header className="page-head">
        <div>
          <h1>작업 내역</h1>
          <p>이 PC에 저장된 최근 30일의 네이버 임시저장 완료 기록입니다.</p>
        </div>
        <div className="page-head-actions">
          <button className="button primary" type="button" onClick={onCreateNew}>
            새 글 작성
          </button>
        </div>
      </header>

      <section className="history-retention-note">
        <FileClock aria-hidden="true" />
        <p>
          글 제목과 본문, 사용 모델과 완료 단계만 로컬에 보관합니다. 토큰과 비용은 기록하지 않으며 30일이 지난 기록은 자동으로 삭제됩니다.
        </p>
      </section>

      {errorMessage ? (
        <section className="message error-message" role="alert">
          <XCircle aria-hidden="true" />
          <div>
            <h2>작업 내역을 처리하지 못했습니다</h2>
            <p>{errorMessage}</p>
          </div>
        </section>
      ) : null}

      {openNotice ? (
        <section className="message success-message" role="status">
          <CheckCircle2 aria-hidden="true" />
          <div>
            <h2>네이버 임시글을 열었습니다</h2>
            <p>{openNotice} 내용을 검토한 뒤 네이버에서 직접 발행해 주세요.</p>
          </div>
        </section>
      ) : null}

      {isLoading ? (
        <section className="history-empty" role="status">
          <LoaderCircle className="is-spinning" aria-hidden="true" />
          <h2>작업 내역을 불러오는 중입니다</h2>
        </section>
      ) : entries.length === 0 ? (
        <section className="history-empty">
          <FileClock aria-hidden="true" />
          <h2>아직 저장된 작업 내역이 없습니다</h2>
          <p>새 글을 만들고 네이버 임시저장 확인까지 완료하면 여기에 기록됩니다.</p>
          <button className="button secondary" type="button" onClick={onCreateNew}>
            첫 글 작성하기
          </button>
        </section>
      ) : (
        <section className="history-panel" aria-label="최근 30일 작업 내역">
          <div className="history-table-scroll">
            <table className="history-table">
              <thead>
                <tr>
                  <th scope="col">작성 일시</th>
                  <th scope="col">글 제목</th>
                  <th scope="col">상태</th>
                  <th scope="col">사용 모델</th>
                  <th scope="col">추론 강도</th>
                  <th scope="col">최종 단계</th>
                  <th scope="col">행동</th>
                </tr>
              </thead>
              <tbody>
                {entries.map((entry) => (
                  <Fragment key={entry.id}>
                    <tr>
                      <td>{formatCreatedAt(entry.createdAt)}</td>
                      <td className="history-title-cell">{entry.title}</td>
                      <td>
                        <span className="history-status">
                          <CheckCircle2 aria-hidden="true" />
                          임시저장 완료
                        </span>
                      </td>
                      <td>{entry.modelName}</td>
                      <td>{entry.reasoningLabel}</td>
                      <td>네이버 임시저장 확인</td>
                      <td>
                        <div className="history-actions">
                          <button
                            className="button primary"
                            type="button"
                            disabled={openingId === entry.id}
                            onClick={() => void openDraft(entry)}
                          >
                            {openingId === entry.id ? (
                              <LoaderCircle className="is-spinning" aria-hidden="true" />
                            ) : (
                              <ExternalLink aria-hidden="true" />
                            )}
                            {openingId === entry.id ? '여는 중…' : '임시글 열기'}
                          </button>
                          <button
                            className="button secondary"
                            type="button"
                            aria-expanded={expandedId === entry.id}
                            onClick={() => setExpandedId((current) =>
                              current === entry.id ? null : entry.id
                            )}
                          >
                            {expandedId === entry.id ? '상세 닫기' : '상세 보기'}
                          </button>
                          <button
                            className="button danger"
                            type="button"
                            disabled={deletingId === entry.id}
                            onClick={() => void removeEntry(entry)}
                          >
                            {deletingId === entry.id ? (
                              <LoaderCircle className="is-spinning" aria-hidden="true" />
                            ) : (
                              <Trash2 aria-hidden="true" />
                            )}
                            {deletingId === entry.id ? '삭제 중…' : '기록 삭제'}
                          </button>
                        </div>
                      </td>
                    </tr>
                    {expandedId === entry.id ? (
                      <tr className="history-detail-row">
                        <td colSpan={7}>
                          <div className="history-detail">
                            <dl>
                              <div>
                                <dt>이미지 사용</dt>
                                <dd>{entry.imageCount > 0 ? `${entry.imageCount}장` : '사용 안 함'}</dd>
                              </div>
                              <div>
                                <dt>글 유형</dt>
                                <dd>{entry.settings.articleType}</dd>
                              </div>
                              <div>
                                <dt>목표 글자 수</dt>
                                <dd>{entry.settings.targetLength.toLocaleString('ko-KR')}자</dd>
                              </div>
                            </dl>
                            <h3>저장한 본문</h3>
                            <p>{entry.body}</p>
                          </div>
                        </td>
                      </tr>
                    ) : null}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </>
  );
}

import {
  ArrowRight,
  Building2,
  CheckCircle2,
  History,
  KeyRound,
  Link2,
  LoaderCircle,
  RefreshCw,
} from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import type { WorkHistoryEntry } from '../main/work-history.js';

interface HomeSummary {
  readonly brandReady: boolean;
  readonly openAiReady: boolean;
  readonly entries: readonly WorkHistoryEntry[];
}

function formatWorkDate(value: string): string {
  return new Intl.DateTimeFormat('ko-KR', {
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value));
}

export function HomeScreen({
  userId,
  licenseEndsAt,
  onCreateNew,
  onOpenHistory,
  onOpenBrand,
  onOpenOpenAi,
  onOpenNaver,
}: {
  readonly userId: string;
  readonly licenseEndsAt: string;
  readonly onCreateNew: () => void;
  readonly onOpenHistory: () => void;
  readonly onOpenBrand: () => void;
  readonly onOpenOpenAi: () => void;
  readonly onOpenNaver: () => void;
}) {
  const [summary, setSummary] = useState<HomeSummary | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const loadSummary = useCallback(async (): Promise<void> => {
    setSummary(null);
    setErrorMessage(null);

    try {
      const [brandResponse, openAiResponse, historyResponse] = await Promise.all([
        window.blowBrandProfile.get(userId),
        window.blowOpenAi.getStatus(),
        window.blowWorkHistory.list(userId),
      ]);

      if (!brandResponse.ok || !openAiResponse.ok || !historyResponse.ok) {
        setErrorMessage('일부 준비 상태를 불러오지 못했습니다. 다시 확인해 주세요.');
        return;
      }

      setSummary({
        brandReady: Boolean(brandResponse.profile),
        openAiReady: openAiResponse.status.saved,
        entries: historyResponse.entries,
      });
    } catch {
      setErrorMessage('작업 정보를 불러오지 못했습니다. 프로그램을 다시 열어 주세요.');
    }
  }, [userId]);

  useEffect(() => {
    void loadSummary();
  }, [loadSummary]);

  const isLoading = !summary && !errorMessage;
  const licenseLabel = new Intl.DateTimeFormat('ko-KR', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  }).format(new Date(licenseEndsAt));

  return (
    <>
      <header className="page-head home-page-head">
        <div>
          <p className="page-eyebrow">나의 작업 공간</p>
          <h1>블로그 글, 여기서 시작하세요.</h1>
          <p>브랜드에 맞는 글을 만들고 네이버에 임시저장하세요.</p>
        </div>
        <span className="license-summary">이용 기간 · {licenseLabel}까지</span>
      </header>

      {errorMessage ? (
        <section className="message error-message" role="alert">
          <div>
            <h2>준비 상태를 불러오지 못했습니다</h2>
            <p>{errorMessage}</p>
          </div>
          <button className="button secondary" type="button" onClick={() => void loadSummary()}>
            <RefreshCw aria-hidden="true" />다시 확인
          </button>
        </section>
      ) : null}

      <div className="home-start-layout">
        <section className="home-start" aria-labelledby="home-ready-heading" aria-busy={isLoading}>
          <div className="home-next-action">
            <span className="home-context-label">
              {isLoading ? '준비 상태 확인 중' : !summary ? '상태 확인 필요' : summary.brandReady && summary.openAiReady ? '작성 준비 완료' : '처음 한 번만 설정해 주세요'}
            </span>
            <h2 id="home-ready-heading">
              {isLoading ? '작업 공간을 확인하고 있어요.' : !summary ? '다시 확인한 뒤 시작해 주세요.' : !summary.brandReady ? '어떤 브랜드의 글을 쓸까요?' : !summary.openAiReady ? '글을 써 줄 AI를 연결하세요.' : '오늘은 어떤 이야기를 쓸까요?'}
            </h2>
            <p>
              {isLoading ? '브랜드 정보와 AI 키 보관 상태를 불러옵니다.' : !summary ? '왼쪽 메뉴에서 각 설정을 직접 확인할 수도 있습니다.' : !summary.brandReady ? '브랜드명, 업종, 소개를 저장하면 매번 설명하지 않아도 글에 반영됩니다.' : !summary.openAiReady ? '본인의 OpenAI API 키를 저장하면 글과 이미지 생성 기능을 사용할 수 있습니다.' : '주제와 키워드를 입력하면 글의 초안을 만들어 드립니다. 내용 확인 후 네이버로 옮길 수 있어요.'}
            </p>
            {summary ? (
              <button
                className="button primary home-start-button"
                type="button"
                onClick={!summary.brandReady ? onOpenBrand : !summary.openAiReady ? onOpenOpenAi : onCreateNew}
              >
                {!summary.brandReady ? '브랜드 정보 입력' : !summary.openAiReady ? 'AI 연결하기' : '새 글 작성'}
                <ArrowRight aria-hidden="true" />
              </button>
            ) : isLoading ? <LoaderCircle className="is-spinning" aria-label="준비 상태 불러오는 중" /> : null}
          </div>

          <div className="home-setup-list" aria-label="처음 사용 준비">
            <button type="button" className="home-setup-row" onClick={onOpenBrand}>
              <span className={summary?.brandReady ? 'setup-marker is-done' : 'setup-marker'}>
                {summary?.brandReady ? <CheckCircle2 aria-hidden="true" /> : <Building2 aria-hidden="true" />}
              </span>
              <span><strong>브랜드 정보</strong><small>어떤 사업인지 AI에게 알려주기</small></span>
              <span className="setup-state">{summary ? summary.brandReady ? '저장됨' : '입력 필요' : isLoading ? '확인 중' : '확인 필요'}</span>
              <ArrowRight aria-hidden="true" />
            </button>
            <button type="button" className="home-setup-row" onClick={onOpenOpenAi}>
              <span className={summary?.openAiReady ? 'setup-marker is-done' : 'setup-marker'}>
                {summary?.openAiReady ? <CheckCircle2 aria-hidden="true" /> : <KeyRound aria-hidden="true" />}
              </span>
              <span><strong>AI 연결</strong><small>OpenAI API 키 저장 · 생성 비용 별도</small></span>
              <span className="setup-state">{summary ? summary.openAiReady ? '키 저장됨' : '연결 필요' : isLoading ? '확인 중' : '확인 필요'}</span>
              <ArrowRight aria-hidden="true" />
            </button>
          </div>
        </section>

        <aside className="home-howto" aria-labelledby="home-howto-heading">
          <h2 id="home-howto-heading">글 한 편, 이렇게 완성해요</h2>
          <ol className="home-workflow">
            <li><span aria-hidden="true">1</span><div><strong>주제와 키워드 입력</strong><p>어떤 글이 필요한지 알려주세요.</p></div></li>
            <li><span aria-hidden="true">2</span><div><strong>만들어진 글 확인</strong><p>내용과 사실관계를 확인하세요.</p></div></li>
            <li><span aria-hidden="true">3</span><div><strong>네이버에 임시저장</strong><p>블로그를 연결하고 글을 옮기세요.</p></div></li>
          </ol>
          <p className="home-publish-note">글을 공개하는 <strong>최종 발행은 네이버에서 직접</strong> 합니다.</p>
          <button type="button" className="button tertiary" onClick={onOpenNaver}>
            <Link2 aria-hidden="true" />네이버 연결 화면 보기<ArrowRight aria-hidden="true" />
          </button>
        </aside>
      </div>

      <section className="home-section home-history" aria-labelledby="home-history-heading">
        <header className="section-heading">
          <div>
            <h2 id="home-history-heading">최근 작업</h2>
            <p>이 PC에 저장된 최근 30일의 임시저장 완료 기록입니다.</p>
          </div>
          <button className="button tertiary" type="button" onClick={onOpenHistory}>
            전체 보기
            <ArrowRight aria-hidden="true" />
          </button>
        </header>

        {!summary && !errorMessage ? (
          <div className="home-loading" role="status">
            <LoaderCircle className="is-spinning" aria-hidden="true" />
            최근 작업을 불러오는 중입니다.
          </div>
        ) : summary?.entries.length ? (
          <ul className="home-history-list">
            {summary.entries.slice(0, 5).map((entry) => (
              <li key={entry.id}>
                <button type="button" onClick={onOpenHistory}>
                  <span className="home-history-icon"><History aria-hidden="true" /></span>
                  <span className="home-history-copy">
                    <strong>{entry.title}</strong>
                    <small>{entry.modelName} · 이미지 {entry.imageCount}장</small>
                  </span>
                  <span className="home-history-state">
                    <CheckCircle2 aria-hidden="true" />
                    임시저장 완료
                  </span>
                  <time dateTime={entry.createdAt}>{formatWorkDate(entry.createdAt)}</time>
                </button>
              </li>
            ))}
          </ul>
        ) : summary ? (
          <div className="home-empty">
            <History aria-hidden="true" />
            <div>
<h3>첫 번째 글을 기다리고 있어요</h3>
<p>네이버에 임시저장한 글을 이곳에서 다시 확인할 수 있습니다.</p>
            </div>
            <button className="button secondary" type="button" onClick={onCreateNew}>
새 글 작성
            </button>
          </div>
        ) : null}
      </section>
    </>
  );
}

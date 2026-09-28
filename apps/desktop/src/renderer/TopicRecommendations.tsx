import { LoaderCircle, RefreshCw, Sparkles } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import type { TopicSuggestion } from '../main/openai-topic-recommendation.js';
import type { AllowedModel, ReasoningEffort } from './model-options.js';

export function TopicRecommendations({
  userId, topic, model, reasoningEffort, unavailableReason, disabled,
  onSelect, onBusyChange,
}: {
  readonly userId: string;
  readonly topic: string;
  readonly model: AllowedModel | undefined;
  readonly reasoningEffort: ReasoningEffort | '';
  readonly unavailableReason: string | null;
  readonly disabled: boolean;
  readonly onSelect: (content: string) => void;
  readonly onBusyChange: (busy: boolean) => void;
}) {
  const [result, setResult] = useState<{
    source: string; suggestions: readonly TopicSuggestion[]; selected: string | null;
  } | null>(null);
  const [pending, setPending] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const inFlight = useRef(false);
  const cancelled = useRef(false);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      if (inFlight.current) void window.blowOpenAi.cancelGeneration().catch(() => {});
    };
  }, []);

  // Typing a different topic starts a fresh set; selecting a suggestion keeps its original seed.
  const currentResult = result && (topic.trim() === result.source || topic === result.selected)
    ? result : null;
  const effort = model && reasoningEffort && model.allowedReasoningEfforts.includes(reasoningEffort)
    ? reasoningEffort
    : model?.allowedReasoningEfforts.includes('low') ? 'low' : model?.allowedReasoningEfforts[0];

  const recommend = async (): Promise<void> => {
    if (inFlight.current || disabled || unavailableReason || !model || !effort || !topic.trim()) return;
    const source = currentResult?.source ?? topic.trim();
    inFlight.current = true;
    cancelled.current = false;
    setPending(true);
    setError(null);
    setNotice(null);
    onBusyChange(true);
    try {
      const response = await window.blowOpenAi.recommendTopics({
        userId, topic: source, modelId: model.modelId, reasoningEffort: effort,
        previousSuggestions: currentResult?.suggestions.map((item) => item.content) ?? [],
      });
      if (!mounted.current) return;
      if (cancelled.current) {
        setNotice('추천 요청을 중단했습니다. 이미 처리된 API 사용료는 발생할 수 있습니다.');
        return;
      }
      if (!response.ok) {
        setError(response.message);
        return;
      }
      setResult({ source, suggestions: response.suggestions, selected: currentResult?.selected ?? null });
      setNotice('추천 내용 3개가 준비됐습니다. 마음에 드는 내용을 선택해 주세요.');
    } catch {
      if (mounted.current) {
        if (cancelled.current) setNotice('추천 요청을 중단했습니다. 이미 처리된 API 사용료는 발생할 수 있습니다.');
        else setError('추천을 받지 못했습니다. 입력과 이전 추천은 유지됩니다. 프로그램의 AI 연결을 확인해 주세요.');
      }
    } finally {
      inFlight.current = false;
      if (mounted.current) {
        setPending(false);
        setCancelling(false);
        onBusyChange(false);
      }
    }
  };

  const cancel = async (): Promise<void> => {
    if (!inFlight.current || cancelling) return;
    cancelled.current = true;
    setCancelling(true);
    try {
      await window.blowOpenAi.cancelGeneration();
    } catch {
      if (mounted.current) {
        setCancelling(false);
        setError('중단 요청을 전달하지 못했습니다. 기존 요청이 끝날 때까지 기다려 주세요.');
      }
    }
  };

  return (
    <div className="topic-recommendations" aria-busy={pending}>
      <div className="topic-recommendation-actions">
        <button
          className="button secondary"
          type="button"
          disabled={disabled || pending || Boolean(unavailableReason) || !model || !topic.trim()}
          aria-describedby="topic-recommendation-cost"
          onClick={() => void recommend()}
        >
          {pending ? <LoaderCircle className="is-spinning" aria-hidden="true" />
            : currentResult ? <RefreshCw aria-hidden="true" /> : <Sparkles aria-hidden="true" />}
          {pending ? '추천 내용 만드는 중…' : currentResult ? '다시 추천 받기' : '내용 작성 추천 받기'}
        </button>
        {pending ? (
          <button className="button danger" type="button" disabled={cancelling} onClick={() => void cancel()}>
            {cancelling ? '중단 요청 중…' : '추천 중단'}
          </button>
        ) : null}
      </div>
      <p className="field-help">짧게 적어도 괜찮아요. AI가 글의 대상, 핵심 내용과 구성 방향을 3가지로 풀어 드립니다.</p>
      <p id="topic-recommendation-cost" className="topic-recommendation-cost">
        추천·재추천마다 본인의 OpenAI API 사용료가 발생합니다. 입력 내용과 저장한 브랜드 작성 정보를 OpenAI로 전송합니다.
        {model ? <span>추천에 사용할 AI: {model.displayName}. 아래 ‘AI 모델’에서 바꿀 수 있습니다.</span> : null}
      </p>
      {unavailableReason ? <p className="field-help">{unavailableReason}</p> : null}
      <div role="status" aria-live="polite">
        {pending ? <p className="field-help">추천을 만들고 있습니다. 자동으로 다시 요청하지 않습니다.</p>
          : notice ? <p className="field-help">{notice}</p> : null}
      </div>
      {error ? <p className="field-error" role="alert">{error}</p> : null}
      {currentResult ? (
        <section className="topic-recommendation-results" aria-labelledby="topic-recommendations-heading">
          <h3 id="topic-recommendations-heading">어떤 방향으로 써볼까요?</h3>
          <p className="field-help">‘이 내용 사용’을 누르면 위 입력칸에 적용됩니다. 적용 후 자유롭게 수정할 수 있습니다.</p>
          <ol className="topic-suggestion-list">
            {currentResult.suggestions.map((suggestion, index) => {
              const selected = topic === suggestion.content;
              return (
                <li className={selected ? 'is-selected' : undefined} key={suggestion.content}>
                  <strong>{index + 1}. {suggestion.title}</strong>
                  <p>{suggestion.content}</p>
                  <button
                    className={selected ? 'button primary' : 'button secondary'}
                    type="button"
                    disabled={disabled || pending || selected}
                    aria-label={suggestion.title + (selected ? ' 선택됨' : ' 이 내용 사용')}
                    onClick={() => {
                      setResult({ ...currentResult, selected: suggestion.content });
                      onSelect(suggestion.content);
                      setNotice('선택한 내용을 위 입력칸에 넣었습니다. 필요하면 직접 수정해 주세요.');
                      document.getElementById('new-post-topic')?.focus();
                    }}
                  >{selected ? '선택됨' : '이 내용 사용'}</button>
                </li>
              );
            })}
          </ol>
          <p className="field-help">추천은 작성 방향에 대한 제안입니다. 사실과 다른 부분은 수정해 주세요.</p>
          {currentResult.selected ? (
            <button
              className="button secondary" type="button" disabled={disabled || pending}
              onClick={() => {
                onSelect(currentResult.source);
                setResult({ ...currentResult, selected: null });
                setNotice('처음 입력한 내용으로 되돌렸습니다.');
              }}
            >처음 입력으로 되돌리기</button>
          ) : null}
        </section>
      ) : null}
    </div>
  );
}

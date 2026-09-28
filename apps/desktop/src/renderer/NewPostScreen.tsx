import { getProductPrice, type ProductPrices } from '../shared/product-services.js';
import {
  CheckCircle2,
  CircleAlert,
  FilePenLine,

  ImageIcon,
  LoaderCircle,
  Plus,
  Sparkles,
  Trash2,
  XCircle,
} from 'lucide-react';
import { type FormEvent, useEffect, useRef, useState } from 'react';
import {
  type CoreDraftErrors,
  hasCoreDraftErrors,
  hasExcessiveKeywords,
  parseProductOptions,
  validateCoreDraft,
} from './new-post-draft.js';

import {
  getSelectableModels,
  parseAllowedModels,
  readSavedModelPreference,
  reasoningEffortLabels,
  type ReasoningEffort,
} from './model-options.js';
import { writingTargetLengths } from '../shared/writing-options.js';
import { supabase } from './supabase.js';
import { PostDecorationFields } from './PostDecorationFields.js';
import { defaultPostDecorations, type PostDecorations } from './post-decoration.js';
import { WritingSteps } from './WritingSteps.js';
import { TopicRecommendations } from './TopicRecommendations.js';
import { WritingQueuePanel } from './WritingQueuePanel.js';
import { useWritingQueue } from './useWritingQueue.js';
import type { WritingConfig, WritingJob } from './writing-queue.js';
import type {
  ImageAspectRatio,
  ImageQualityMode,
} from '../main/openai-image-generation.js';

const articleTypes = [
  '정보형',
  '서비스 소개형',
  '문제 해결형',
  '사례·후기형',
  '프로모션형',
  'FAQ형',
  '브랜드 소개형',
  '지역 유입형',
] as const;

interface KeywordRow {
  readonly id: string;
  readonly value: string;
  readonly repetitions: string;
}


export function NewPostScreen({
  userId,
  active = true,
  connectedBlogId,
  onBusyChange,
  onOpenBrandProfile,
  onReviewSaved,
}: {
  readonly userId: string;
  readonly active?: boolean;
  readonly connectedBlogId: string | null;
  readonly onBusyChange: (busy: boolean) => void;
  readonly onOpenBrandProfile: () => void;
  readonly onReviewSaved: () => void;
}) {
  const [decorations, setDecorations] = useState<PostDecorations>(defaultPostDecorations);
  const [topic, setTopic] = useState('');
  const [isTopicRecommending, setIsTopicRecommending] = useState(false);
  const [articleType, setArticleType] = useState('');
  const [targetLength, setTargetLength] = useState(1_800);
  const [keywords, setKeywords] = useState<readonly KeywordRow[]>([{
    id: 'primary',
    value: '',
    repetitions: '3',
  }]);
  const [serviceSelection, setServiceSelection] = useState('');
  const [customService, setCustomService] = useState('');
  const [cta, setCta] = useState('');
  const [brandName, setBrandName] = useState('');
  const [serviceOptions, setServiceOptions] = useState<readonly string[]>([]);
  const [productPrices, setProductPrices] = useState<ProductPrices>({});
  const [isProfileLoading, setIsProfileLoading] = useState(true);
  const [profileError, setProfileError] = useState<string | null>(null);
  const [errors, setErrors] = useState<CoreDraftErrors>({});
  const [notice, setNotice] = useState<string | null>(null);
  const [selectableModels, setSelectableModels] = useState(
    () => parseAllowedModels([]),
  );
  const [modelStatus, setModelStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [modelError, setModelError] = useState<string | null>(null);
  const [modelNotice, setModelNotice] = useState<string | null>(null);
  const [modelId, setModelId] = useState('');
  const [reasoningEffort, setReasoningEffort] = useState<ReasoningEffort | ''>('');
  const [modelReloadToken, setModelReloadToken] = useState(0);
  const [editingId, setEditingId] = useState<string | undefined>();
  const [useGeneratedImages, setUseGeneratedImages] = useState(false);
  const [imageCount, setImageCount] = useState(1);
  const [imageAspectRatio, setImageAspectRatio] = useState<ImageAspectRatio>('landscape');
  const [imageQualityMode, setImageQualityMode] = useState<ImageQualityMode>('economy');
  const [imageStyle, setImageStyle] = useState('');
  const keywordSequence = useRef(0);
  const queue = useWritingQueue(userId, (config) => {
    if (!connectedBlogId || config.blogId !== connectedBlogId) throw new Error('목록에 설정한 블로그와 현재 연결이 다릅니다. 블로그 세팅에서 다시 연결해 주세요.');
    const model = selectableModels.find((item) => item.modelId === config.request.modelId);
    if (modelStatus !== 'ready' || !model || !model.allowedReasoningEfforts.includes(config.request.reasoningEffort as ReasoningEffort)) throw new Error('현재 사용할 수 없는 모델 또는 추론 강도입니다. 해당 글의 설정을 수정해 주세요.');
    if (!brandName || isProfileLoading || profileError) throw new Error('블로그 세팅을 먼저 확인해 주세요.');
  });

  useEffect(() => {
    if (!active) return;
    setIsProfileLoading(true);
    setProfileError(null);
    let current = true;

    void window.blowBrandProfile.get(userId).then((response) => {
      if (!current) return;

      if (response.ok && response.profile) {
        setBrandName(response.profile.brandName);
        const services = parseProductOptions(response.profile.productsAndServices);
        setServiceOptions(services);
        setProductPrices(response.profile.productPrices ?? {});
        setServiceSelection((current) => current === '__custom__' || services.includes(current) ? current : '');
        setCta(response.profile.defaultCta);
      } else if (!response.ok) {
        setProfileError(response.error.message);
      }
      setIsProfileLoading(false);
    });

    return () => {
      current = false;
    };
  }, [active, userId]);

  useEffect(() => {
    if (!active) return;
    let current = true;

    const loadModels = async (): Promise<void> => {
      setModelStatus('loading');
      setModelError(null);

      if (!supabase) {
        if (current) {
          setModelStatus('error');
          setModelError('Supabase 연결 설정을 확인해 주세요.');
        }
        return;
      }

      const [allowedResult, availableResult] = await Promise.all([
        supabase
          .from('allowed_models')
          .select([
            'model_id',
            'display_name',
            'description',
            'recommended_use',
            'allowed_reasoning_efforts',
            'is_default',
            'sort_order',
          ].join(','))
          .eq('is_active', true)
          .order('sort_order', { ascending: false }),
        window.blowOpenAi.listModels(),
      ]);

      if (!current) return;

      if (allowedResult.error) {
        setModelStatus('error');
        setModelError('허용 모델 설정을 불러오지 못했습니다. Supabase 모델 설정 SQL을 적용해 주세요.');
        return;
      }

      if (!availableResult.ok) {
        setModelStatus('error');
        setModelError(availableResult.error.message);
        return;
      }

      const allowedModels = parseAllowedModels(allowedResult.data);
      const nextSelectableModels = getSelectableModels(
        allowedModels,
        availableResult.modelIds,
      );

      if (allowedModels.length === 0) {
        setModelStatus('error');
        setModelError('BLOW에서 사용하도록 승인된 모델이 아직 없습니다.');
        return;
      }

      if (nextSelectableModels.length === 0) {
        setModelStatus('error');
        setModelError('현재 API 키에서 사용할 수 있는 BLOW 허용 모델이 없습니다. 키의 프로젝트와 권한을 확인해 주세요.');
        return;
      }

      setSelectableModels(nextSelectableModels);
      const saved = readSavedModelPreference(
        localStorage.getItem(`blow:model-preference:${userId}`),
        nextSelectableModels,
      );

      if (saved.preference) {
        setModelId(saved.preference.modelId);
        setReasoningEffort(saved.preference.reasoningEffort);
        setModelNotice('이 PC에 저장한 모델 설정을 불러왔습니다.');
      } else {
        setModelId('');
        setReasoningEffort('');
        setModelNotice(saved.invalid
          ? '저장했던 모델을 현재 사용할 수 없습니다. 모델과 추론 강도를 다시 선택해 주세요.'
          : null);
      }

      setModelStatus('ready');
    };

    void loadModels();

    return () => {
      current = false;
    };
  }, [active, modelReloadToken, userId]);

  const selectedService = serviceSelection === '__custom__'
    ? customService.trim()
    : serviceSelection;
  const selectedModel = selectableModels.find((model) => model.modelId === modelId);
  const recommendationModel = selectedModel
    ?? selectableModels.find((model) => model.isDefault)
    ?? selectableModels[0];
  const hasErrors = hasCoreDraftErrors(errors);
  const showKeywordWarning = hasExcessiveKeywords(keywords);
  const isGenerating = queue.busy;
  useEffect(() => {
    onBusyChange(queue.busy || isTopicRecommending);
  }, [queue.busy, isTopicRecommending, onBusyChange]);

  const clearError = (field: keyof CoreDraftErrors): void => {
    setErrors((current) => ({ ...current, [field]: undefined }));
    setNotice(null);
  };

  const changeModel = (nextModelId: string): void => {
    setModelId(nextModelId);
    setReasoningEffort('');
    setErrors((current) => ({
      ...current,
      modelId: undefined,
      reasoningEffort: undefined,
    }));
    setModelNotice(null);
    setNotice(null);
    localStorage.removeItem(`blow:model-preference:${userId}`);
  };

  const changeReasoningEffort = (nextEffort: ReasoningEffort | ''): void => {
    setReasoningEffort(nextEffort);
    setErrors((current) => ({ ...current, reasoningEffort: undefined }));
    setModelNotice(null);
    setNotice(null);

    if (modelId && nextEffort) {
      localStorage.setItem(
        `blow:model-preference:${userId}`,
        JSON.stringify({ modelId, reasoningEffort: nextEffort }),
      );
      setModelNotice('모델 설정을 이 PC에 저장했습니다.');
    }
  };

  const validateKeywords = (): void => {
    const result = validateCoreDraft({
      topic,
      articleType,
      modelId,
      reasoningEffort,
      keywords,
    });
    setErrors((current) => ({ ...current, keywords: result.keywords }));
  };

  const updateKeyword = (
    id: string,
    field: 'value' | 'repetitions',
    value: string,
  ): void => {
    setKeywords((current) => current.map((keyword) =>
      keyword.id === id ? { ...keyword, [field]: value } : keyword,
    ));
    clearError('keywords');
  };

  const addKeyword = (): void => {
    keywordSequence.current += 1;
    setKeywords((current) => [
      ...current,
      {
        id: `secondary-${keywordSequence.current}`,
        value: '',
        repetitions: '2',
      },
    ]);
    clearError('keywords');
  };

  const removeKeyword = (id: string): void => {
    setKeywords((current) => current.filter((keyword) => keyword.id !== id));
    clearError('keywords');
  };

  const resetImageResult = (): void => setNotice(null);

  const editJob = (job: WritingJob): void => {
    const { request, images, decorations } = job.config;
    setEditingId(job.id);
    setTopic(request.topic);
    setArticleType(request.articleType);
    setTargetLength(request.targetLength);
    setKeywords(request.keywords.map((item, index) => ({ id: index === 0 ? 'primary' : `secondary-${++keywordSequence.current}`, value: item.value, repetitions: String(item.repetitions) })));
    setServiceSelection(request.service ? '__custom__' : '');
    setCustomService(request.service);
    setCta(request.cta);
    setModelId(request.modelId);
    setReasoningEffort(request.reasoningEffort as ReasoningEffort);
    setUseGeneratedImages(images.enabled);
    setImageCount(images.count);
    setImageAspectRatio(images.aspectRatio);
    setImageQualityMode(images.qualityMode);
    setImageStyle(images.style);
    setDecorations(structuredClone(decorations));
    setErrors({});
    setNotice('목록에 담긴 글의 설정을 수정하고 있습니다.');
    document.getElementById('new-post-topic')?.focus();
  };

  const saveSettings = (startImmediately: boolean): void => {
    if (queue.busy || isTopicRecommending || !queue.ready) return;
    const nextErrors = validateCoreDraft({ topic, articleType, modelId, reasoningEffort, keywords });
    setErrors(nextErrors);
    setNotice(null);
    if (hasCoreDraftErrors(nextErrors)) {
      const index = nextErrors.keywords?.findIndex((keyword) => keyword.value || keyword.repetitions) ?? 0;
      document.getElementById(nextErrors.topic ? 'new-post-topic' : nextErrors.articleType ? 'new-post-article-type'
        : nextErrors.modelId ? 'new-post-model' : nextErrors.reasoningEffort ? 'new-post-reasoning' : `new-post-keyword-${Math.max(index, 0)}`)?.focus();
      return;
    }
    const config: WritingConfig = {
      request: { userId, topic: topic.trim(), articleType, targetLength,
        keywords: keywords.map((keyword) => ({ value: keyword.value.trim(), repetitions: Number(keyword.repetitions) })),
        service: selectedService, cta: cta.trim(), modelId, reasoningEffort },
      blogId: connectedBlogId ?? '', modelName: selectedModel?.displayName ?? modelId,
      reasoningLabel: reasoningEffort ? reasoningEffortLabels[reasoningEffort] : '',
      decorations: structuredClone(decorations),
      images: { enabled: useGeneratedImages, count: imageCount, aspectRatio: imageAspectRatio, qualityMode: imageQualityMode, style: imageStyle.trim() },
    };
    const id = queue.add(config, editingId);
    if (!id) { document.getElementById('writing-queue')?.scrollIntoView({ block: 'start' }); return; }
    if (startImmediately) {
      // Keep the form linked to this job until execution is explicitly confirmed.
      // Canceling and trying again updates the same job instead of losing input or adding duplicates.
      setEditingId(id);
      queue.start(id);
      return;
    }
    setEditingId(undefined);
    setTopic('');
    setKeywords([{ id: 'primary', value: '', repetitions: '3' }]);
    setNotice('글별 설정을 목록에 저장했습니다. 다음 주제를 입력하거나 목록을 실행하세요.');
    document.getElementById('writing-queue')?.scrollIntoView({ block: 'start' });
  };

  const submit = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    saveSettings(false);
  };

  return (
    <div className="compose-page">
      <header className="page-head">
        <div>
          <h1>새 글 작성</h1>
          <p>글별 주제와 꾸미기를 정하면 네이버 임시저장까지 자동으로 진행합니다. 저장된 글은 마지막에 확인하세요.</p>
        </div>
      </header>

      <WritingSteps current={queue.busy ? 3 : queue.jobs.length > 0 && queue.jobs.every((job) => job.status === 'saved') ? 4 : 2} />
      <p className="connected-blog-note"><CheckCircle2 aria-hidden="true" />저장할 블로그: {connectedBlogId ?? '연결 재확인 필요'}</p>

      {hasErrors ? (
        <div className="message error-message" role="alert">
          <XCircle aria-hidden="true" />
          <div>
            <h2>입력 내용을 확인해 주세요</h2>
            <p>표시된 필수 항목과 키워드 규칙을 수정한 뒤 다시 확인해 주세요.</p>
          </div>
        </div>
      ) : null}

      <WritingQueuePanel jobs={queue.jobs} busy={queue.busy} stopping={queue.stopping}
        disabled={!queue.ready || isTopicRecommending || Boolean(editingId)} error={queue.error}
        confirmation={queue.confirmation} onCancelStart={queue.cancelStart}
        onConfirmStart={() => void queue.confirmStart(() => {
          if (editingId) {
            setEditingId(undefined);
            setTopic('');
            setKeywords([{ id: 'primary', value: '', repetitions: '3' }]);
            setErrors({});
          }
          setNotice(null);
          document.getElementById('writing-queue')?.scrollIntoView({ block: 'start' });
        })}
        onStart={() => void queue.start()} onStop={queue.stop} onEdit={editJob} onRemove={queue.remove}
        onReview={onReviewSaved} />

      {notice ? (
        <div className="message success-message" role="status">
          <CheckCircle2 aria-hidden="true" />
          <div>
            <h2>작성 목록 안내</h2>
            <p>{notice}</p>
          </div>
        </div>
      ) : null}


          {!isProfileLoading && !brandName ? (
            <div className="new-post-profile-warning">
              <CircleAlert aria-hidden="true" />
              <div>
                <strong>블로그 세팅을 먼저 완료해 주세요</strong>
                <p>실제 글을 만들기 전 브랜드 기본 정보를 먼저 저장해 주세요.</p>
                <button className="button secondary" type="button" onClick={onOpenBrandProfile}>
                  블로그 세팅 열기
                </button>
              </div>
            </div>
          ) : null}

          {profileError ? (
            <div className="new-post-profile-warning" role="alert">
              <CircleAlert aria-hidden="true" />
              <div>
                <strong>브랜드 정보를 불러오지 못했습니다</strong>
                <p>{profileError}</p>
              </div>
            </div>
          ) : null}

<form id="new-post-form" className="compose-stack" aria-busy={isGenerating} noValidate onSubmit={submit}>
<fieldset className="compose-fields" disabled={isGenerating || !queue.ready}>
<legend className="compose-editor-title">{editingId ? '목록의 글 설정 수정' : '글별 설정'}</legend>
{editingId ? <button className="button secondary" type="button" onClick={() => { setEditingId(undefined); setNotice('목록의 기존 설정은 변경하지 않았습니다.'); }}>수정 취소</button> : null}
<section className="compose-section" aria-labelledby="compose-section-01">
<header className="compose-section-heading"><span className="compose-section-number" aria-hidden="true">01</span><div><h2 id="compose-section-01">글 주제</h2><p>어떤 내용을 전하고 싶은지 적어 주세요.</p></div><span className="compose-section-kind">필수</span></header>
<div className="compose-section-body">            <div className="field-group">
              <label htmlFor="new-post-topic">쓰고 싶은 내용 <span>필수</span></label>
              <textarea
                id="new-post-topic"
                className="new-post-topic"
                disabled={isGenerating || isTopicRecommending}
                value={topic}
                maxLength={500}
                required
                aria-invalid={Boolean(errors.topic)}
                aria-describedby={errors.topic ? 'new-post-topic-help new-post-topic-error' : 'new-post-topic-help'}
                placeholder="예: 처음 실손보험을 준비할 때 확인해야 할 보장 항목을 쉽게 설명해 주세요."
                onBlur={() => setErrors((current) => ({
                  ...current,
                  topic: topic.trim() ? undefined : '글의 주제를 입력해 주세요.',
                }))}
                onChange={(event) => {
                  setTopic(event.target.value);
                  clearError('topic');
                }}
              />
              <p id="new-post-topic-help" className="field-help new-post-character-count">
                <span>독자가 이 글에서 얻어야 할 도움을 적어 주세요.</span>
                <span>{topic.length}/500자</span>
              </p>
              {errors.topic ? <p id="new-post-topic-error" className="field-error">{errors.topic}</p> : null}
            </div>
            <TopicRecommendations
              userId={userId}
              topic={topic}
              model={recommendationModel}
              reasoningEffort={selectedModel ? reasoningEffort : ''}
              unavailableReason={isProfileLoading ? '블로그 세팅을 불러오는 중입니다.'
                : !brandName ? '블로그 세팅을 먼저 저장해 주세요.'
                : modelStatus === 'loading' ? '사용 가능한 AI를 확인하는 중입니다.'
                : modelStatus === 'error' ? modelError ?? '블로그 세팅의 AI 연결을 확인해 주세요.'
                : !connectedBlogId ? '네이버 연결을 먼저 확인해 주세요.'
                : !recommendationModel ? '추천에 사용할 AI가 없습니다. AI 연결을 확인해 주세요.' : null}
              disabled={isGenerating}
              onSelect={(content) => { setTopic(content); clearError('topic'); }}
              onBusyChange={setIsTopicRecommending}
            />

</div></section>
<section className="compose-section" aria-labelledby="compose-section-02">
<header className="compose-section-heading"><span className="compose-section-number" aria-hidden="true">02</span><div><h2 id="compose-section-02">글 유형</h2><p>목적에 맞는 글의 방식을 선택하세요.</p></div><span className="compose-section-kind">필수</span></header>
<div className="compose-section-body">              <div className="field-group">
                <label htmlFor="new-post-article-type">어떤 방식의 글인가요? <span>필수</span></label>
                <select
                  id="new-post-article-type"
                  value={articleType}
                  required
                  aria-invalid={Boolean(errors.articleType)}
                  aria-describedby={errors.articleType ? 'new-post-article-type-error' : undefined}
                  onBlur={() => setErrors((current) => ({
                    ...current,
                    articleType: articleType ? undefined : '글 유형을 선택해 주세요.',
                  }))}
                  onChange={(event) => {
                    setArticleType(event.target.value);
                    clearError('articleType');
                  }}
                >
                  <option value="">선택해 주세요</option>
                  {articleTypes.map((type) => <option key={type} value={type}>{type}</option>)}
                </select>
                {errors.articleType ? (
                  <p id="new-post-article-type-error" className="field-error">{errors.articleType}</p>
                ) : null}
              </div>

</div></section>
<section className="compose-section" aria-labelledby="compose-section-03">
<header className="compose-section-heading"><span className="compose-section-number" aria-hidden="true">03</span><div><h2 id="compose-section-03">글 길이</h2><p>원하는 분량을 선택하세요.</p></div><span className="compose-section-kind">필수</span></header>
<div className="compose-section-body">              <div className="field-group">
                <label htmlFor="new-post-target-length">목표 글자 수 <span>공백 제외</span></label>
                <select
                  id="new-post-target-length"
                  value={targetLength}
                  onChange={(event) => {
                    setTargetLength(Number(event.target.value));
                    setNotice(null);
                  }}
                >
                  {writingTargetLengths.map((length) => (
                    <option key={length} value={length}>{length.toLocaleString('ko-KR')}자</option>
                  ))}
                </select>
                <p className="field-help">생성 결과의 허용 범위는 목표값의 ±10%입니다.</p>
              </div></div></section>
<section className="compose-section" aria-labelledby="compose-section-04">
<header className="compose-section-heading"><span className="compose-section-number" aria-hidden="true">04</span><div><h2 id="compose-section-04">키워드</h2><p>글에 꼭 들어갈 단어와 반복 횟수를 정하세요.</p></div><span className="compose-section-kind">필수</span></header>
<div className="compose-section-body">            <fieldset className="new-post-keywords">
              <legend>글에 꼭 넣을 키워드</legend>
              <p className="field-help">핵심 단어를 입력하세요. 기본 키워드는 제목에 1번, 본문에는 아래 횟수만큼 들어갑니다.</p>

              <div className="new-post-keyword-list">
                {keywords.map((keyword, index) => {
                  const keywordError = errors.keywords?.[index];
                  const valueErrorId = `new-post-keyword-${index}-error`;
                  const repetitionsErrorId = `new-post-repetitions-${index}-error`;

                  return (
                    <div className="new-post-keyword-row" key={keyword.id}>
                      <div className="field-group">
                        <label htmlFor={`new-post-keyword-${index}`}>
                          {index === 0 ? '기본 키워드' : `보조 키워드 ${index}`}
                          {index === 0 ? <span>필수</span> : null}
                        </label>
                        <input
                          id={`new-post-keyword-${index}`}
                          value={keyword.value}
                          maxLength={index === 0 ? 30 : 80}
                          required
                          aria-invalid={Boolean(keywordError?.value)}
                          aria-describedby={keywordError?.value ? valueErrorId : undefined}
                          placeholder={index === 0 ? '예: 실손보험' : '예: 보장 범위'}
                          onBlur={validateKeywords}
                          onChange={(event) => updateKeyword(keyword.id, 'value', event.target.value)}
                        />
                        {keywordError?.value ? (
                          <p id={valueErrorId} className="field-error">{keywordError.value}</p>
                        ) : null}
                      </div>

                      <div className="field-group new-post-repetitions">
                        <label htmlFor={`new-post-repetitions-${index}`}>본문 반복 횟수</label>
                        <input
                          id={`new-post-repetitions-${index}`}
                          type="number"
                          min="1"
                          step="1"
                          inputMode="numeric"
                          value={keyword.repetitions}
                          aria-invalid={Boolean(keywordError?.repetitions)}
                          aria-describedby={keywordError?.repetitions ? repetitionsErrorId : undefined}
                          onBlur={validateKeywords}
                          onChange={(event) => updateKeyword(keyword.id, 'repetitions', event.target.value)}
                        />
                        {keywordError?.repetitions ? (
                          <p id={repetitionsErrorId} className="field-error">{keywordError.repetitions}</p>
                        ) : null}
                      </div>

                      {index > 0 ? (
                        <button
                          className="button danger icon-only new-post-keyword-delete"
                          type="button"
                          aria-label={`보조 키워드 ${index} 삭제`}
                          title="보조 키워드 삭제"
                          onClick={() => removeKeyword(keyword.id)}
                        >
                          <Trash2 aria-hidden="true" />
                        </button>
                      ) : <span className="new-post-keyword-delete-spacer" aria-hidden="true" />}
                    </div>
                  );
                })}
              </div>

              {showKeywordWarning ? (
                <div className="new-post-keyword-warning" role="status">
                  <CircleAlert aria-hidden="true" />
                  <p>키워드가 많으면 목표 글자 수 안에서 반복 횟수를 맞추기 어렵습니다. 꼭 필요한 키워드만 남겨 주세요.</p>
                </div>
              ) : null}

              <button className="button secondary new-post-keyword-add" type="button" onClick={addKeyword}>
                <Plus aria-hidden="true" />
                보조 키워드 추가
              </button>
            </fieldset>

</div></section>
<section className="compose-section" aria-labelledby="compose-section-05">
<header className="compose-section-heading"><span className="compose-section-number" aria-hidden="true">05</span><div><h2 id="compose-section-05">상품·서비스</h2><p>이번 글에서 소개할 항목이 있다면 선택하세요.</p></div><span className="compose-section-kind">선택</span></header>
<div className="compose-section-body">
            <div className="field-group">
              <label htmlFor="new-post-service">이번 글의 상품·서비스 <span>선택</span></label>
              <select
                id="new-post-service"
                value={serviceSelection}
                onChange={(event) => {
                  setServiceSelection(event.target.value);
                  setNotice(null);
                }}
              >
                <option value="">지정하지 않음</option>
                {serviceOptions.map((service) => (
                  <option key={service} value={service}>{service}{getProductPrice(productPrices, service) ? ` — ${getProductPrice(productPrices, service)}` : ''}</option>
                ))}
                <option value="__custom__">직접 입력</option>
              </select>
              <p className="field-help">블로그 세팅에 저장한 {serviceOptions.length}개 항목입니다. 선택한 항목만 이번 글에 우선 반영합니다.</p>
              <button className="button secondary" type="button" onClick={() => {
                onOpenBrandProfile();
                requestAnimationFrame(() => {
                  const heading = document.getElementById('brand-products-heading');
                  heading?.scrollIntoView({ block: 'start' });
                  heading?.focus({ preventScroll: true });
                });
              }}>상품·서비스 관리</button>
            </div>

            {serviceSelection === '__custom__' ? (
              <div className="field-group">
                <label htmlFor="new-post-custom-service">직접 입력할 상품·서비스 <span>선택</span></label>
                <input
                  id="new-post-custom-service"
                  value={customService}
                  maxLength={200}
                  placeholder="예: 자동차보험 갱신 상담"
                  onChange={(event) => {
                    setCustomService(event.target.value);
                    setNotice(null);
                  }}
                />
              </div>
            ) : null}</div></section>
<section className="compose-section" aria-labelledby="compose-section-06">
<header className="compose-section-heading"><span className="compose-section-number" aria-hidden="true">06</span><div><h2 id="compose-section-06">AI 모델과 검토 깊이</h2><p>글을 작성할 AI와 얼마나 깊이 검토할지 선택하세요.</p></div><span className="compose-section-kind">필수</span></header>
<div className="compose-section-body"><div className="new-post-model-settings">
            <p className="field-help">GPT-5.6 Luna는 비용 절약, GPT-5.6 Terra는 일반 글쓰기, GPT-6 Astra는 복잡한 글쓰기에 추천합니다. Astra는 사용료가 상대적으로 높습니다.</p>

            {modelStatus === 'loading' ? (
              <p className="new-post-model-status" role="status">사용 가능한 모델을 안전하게 확인하고 있습니다…</p>
            ) : null}

            {modelError ? (
              <div className="new-post-model-error" role="alert">
                <CircleAlert aria-hidden="true" />
                <div>
                  <strong>모델을 불러오지 못했습니다</strong>
                  <p>{modelError}</p>
                  <button
                    className="button secondary"
                    type="button"
                    onClick={() => setModelReloadToken((current) => current + 1)}
                  >
                    다시 확인
                  </button>
                </div>
              </div>
            ) : null}

            <div className="field-group">
              <label htmlFor="new-post-model">AI 모델 <span>필수</span></label>
              <select
                id="new-post-model"
                form="new-post-form"
                value={modelId}
                required
                disabled={modelStatus !== 'ready' || isTopicRecommending}
                aria-invalid={Boolean(errors.modelId)}
                aria-describedby={errors.modelId ? 'new-post-model-help new-post-model-error' : 'new-post-model-help'}
                onBlur={() => setErrors((current) => ({
                  ...current,
                  modelId: modelId ? undefined : '사용할 GPT 모델을 선택해 주세요.',
                }))}
                onChange={(event) => changeModel(event.target.value)}
              >
                <option value="">
                  {modelStatus === 'loading'
                    ? '모델 확인 중…'
                    : modelStatus === 'error'
                      ? '모델을 불러올 수 없음'
                      : '모델을 선택해 주세요'}
                </option>
                {selectableModels.map((model) => (
                  <option key={model.modelId} value={model.modelId}>
                    {model.displayName}{model.isDefault ? ' (권장)' : ''}
                  </option>
                ))}
              </select>
              <p id="new-post-model-help" className="field-help">
                BLOW가 선정한 3종 중 이 API 키로 사용할 수 있는 모델만 표시합니다. 선택한 설정은 이 PC에 기억됩니다.
              </p>
              {errors.modelId ? (
                <p id="new-post-model-error" className="field-error">{errors.modelId}</p>
              ) : null}
            </div>

            <div className="field-group">
              <label htmlFor="new-post-reasoning">AI 검토 깊이 <span>필수</span></label>
              <select
                id="new-post-reasoning"
                form="new-post-form"
                value={reasoningEffort}
                required
                disabled={!selectedModel || isTopicRecommending}
                aria-invalid={Boolean(errors.reasoningEffort)}
                aria-describedby={errors.reasoningEffort ? 'new-post-reasoning-help new-post-reasoning-error' : 'new-post-reasoning-help'}
                onBlur={() => setErrors((current) => ({
                  ...current,
                  reasoningEffort: reasoningEffort ? undefined : '추론 강도를 선택해 주세요.',
                }))}
                onChange={(event) => changeReasoningEffort(
                  event.target.value as ReasoningEffort | '',
                )}
              >
                <option value="">{selectedModel ? '검토 깊이를 선택해 주세요' : '먼저 모델을 선택해 주세요'}</option>
                {selectedModel?.allowedReasoningEfforts.map((effort) => (
                  <option key={effort} value={effort}>
                    {reasoningEffortLabels[effort]}{effort === 'medium' ? ' (권장)' : ''}
                  </option>
                ))}
              </select>
              <p id="new-post-reasoning-help" className="field-help">
                추론 강도라고도 합니다. 대부분의 글에는 ‘중간’이 무난하며, 높이면 시간이 더 걸릴 수 있습니다.
              </p>
              {errors.reasoningEffort ? (
                <p id="new-post-reasoning-error" className="field-error">{errors.reasoningEffort}</p>
              ) : null}
            </div>

            {selectedModel ? (
              <details className="new-post-model-card model-details">
                <summary>선택한 모델 자세히 보기</summary>
                <div>
                  <strong>{selectedModel.displayName}</strong>
                  {selectedModel.isDefault ? <span>권장</span> : null}
                </div>
                <p>{selectedModel.description}</p>
                <dl>
                  <div>
                    <dt>모델 ID</dt>
                    <dd><code>{selectedModel.modelId}</code></dd>
                  </div>
                  <div>
                    <dt>권장 용도</dt>
                    <dd>{selectedModel.recommendedUse}</dd>
                  </div>
                </dl>
              </details>
            ) : null}

            {modelNotice ? <p className="new-post-model-notice" role="status">{modelNotice}</p> : null}

            <div className="connection-note new-post-cost-note">
              <FilePenLine aria-hidden="true" />
              <p>모델 확인과 선택만으로 콘텐츠 생성 비용은 발생하지 않습니다. 실제 추천·생성 버튼을 누를 때만 본인의 OpenAI 계정에 API 사용료가 발생할 수 있습니다.</p>
            </div>
          </div></div></section>
<section className="compose-section" aria-labelledby="compose-section-07">
<header className="compose-section-heading"><span className="compose-section-number" aria-hidden="true">07</span><div><h2 id="compose-section-07">AI 이미지</h2><p>이미지 사용 여부를 먼저 선택하고, 필요하면 세부 설정을 이어서 정하세요.</p></div><span className="compose-section-kind">선택</span></header>
<div className="compose-section-body"><div className="new-post-image-settings">
            <div>
              <h3 id="new-post-image-heading">AI 이미지</h3>
              <p>글과 어울리는 이미지를 함께 만듭니다. 이미지 생성 비용은 별도입니다.</p>
            </div>

            <fieldset className="new-post-image-choice">
              <legend>이미지 사용 여부</legend>
              <div>
                <label className={!useGeneratedImages ? 'is-selected' : undefined}>
                  <input
                    form="new-post-form"
                    type="radio"
                    name="new-post-use-images"
                    checked={!useGeneratedImages}
                    onChange={() => {
                      setUseGeneratedImages(false);
                      resetImageResult();
                    }}
                  />
                  <span>
                    <strong>사용 안 함</strong>
                    <small>제목과 본문만 생성합니다.</small>
                  </span>
                </label>
                <label className={useGeneratedImages ? 'is-selected' : undefined}>
                  <input
                    form="new-post-form"
                    type="radio"
                    name="new-post-use-images"
                    checked={useGeneratedImages}
                    onChange={() => {
                      setUseGeneratedImages(true);
                      resetImageResult();
                    }}
                  />
                  <span>
                    <strong>AI 이미지 사용</strong>
                    <small>별도의 이미지 API 비용이 발생합니다.</small>
                  </span>
                </label>
              </div>
            </fieldset>

            {useGeneratedImages ? (
              <>
                <div className="new-post-image-grid">
                  <div className="field-group">
                    <label htmlFor="new-post-image-count">생성 장수</label>
                    <select
                      id="new-post-image-count"
                      form="new-post-form"
                      value={imageCount}
                      onChange={(event) => {
                        setImageCount(Number(event.target.value));
                        resetImageResult();
                      }}
                    >
                      {[1, 2, 3, 4].map((count) => (
                        <option key={count} value={count}>{count}장</option>
                      ))}
                    </select>
                    <p className="field-help">한 번에 최대 4장까지 만들 수 있습니다.</p>
                  </div>

                  <div className="field-group">
                    <label htmlFor="new-post-image-ratio">이미지 비율</label>
                    <select
                      id="new-post-image-ratio"
                      form="new-post-form"
                      value={imageAspectRatio}
                      onChange={(event) => {
                        setImageAspectRatio(event.target.value as ImageAspectRatio);
                        resetImageResult();
                      }}
                    >
                      <option value="landscape">가로형</option>
                      <option value="square">정사각형</option>
                      <option value="portrait">세로형</option>
                    </select>
                    <p className="field-help">한 글의 생성 이미지는 모두 같은 비율을 사용합니다.</p>
                  </div>
                </div>

                <fieldset className="new-post-image-choice">
                  <legend>품질 모드</legend>
                  <div>
                    <label className={imageQualityMode === 'economy' ? 'is-selected' : undefined}>
                      <input
                        form="new-post-form"
                        type="radio"
                        name="new-post-image-quality"
                        value="economy"
                        checked={imageQualityMode === 'economy'}
                        onChange={() => {
                          setImageQualityMode('economy');
                          resetImageResult();
                        }}
                      />
                      <span>
                        <strong>비용 절약형</strong>
                        <small>빠른 초안용 저품질 설정입니다.</small>
                      </span>
                    </label>
                    <label className={imageQualityMode === 'quality' ? 'is-selected' : undefined}>
                      <input
                        form="new-post-form"
                        type="radio"
                        name="new-post-image-quality"
                        value="quality"
                        checked={imageQualityMode === 'quality'}
                        onChange={() => {
                          setImageQualityMode('quality');
                          resetImageResult();
                        }}
                      />
                      <span>
                        <strong>고품질형</strong>
                        <small>더 오래 걸리고 비용이 커질 수 있습니다.</small>
                      </span>
                    </label>
                  </div>
                </fieldset>

                <div className="field-group">
                  <label htmlFor="new-post-image-style">이번 글의 이미지 스타일 <span>선택</span></label>
                  <textarea
                    id="new-post-image-style"
                    form="new-post-form"
                    value={imageStyle}
                    maxLength={500}
                    placeholder="예: 밝은 자연광이 들어오는 상담 공간, 차분한 파란색 계열"
                    onChange={(event) => {
                      setImageStyle(event.target.value);
                      resetImageResult();
                    }}
                  />
                  <p className="field-help">비워 두면 블로그 세팅에 저장한 이미지 스타일을 사용합니다.</p>
                </div>

                <div className="connection-note new-post-image-cost-note">
                  <ImageIcon aria-hidden="true" />
                  <p>이미지 장수와 품질에 따라 본인의 OpenAI API 비용과 처리 시간이 늘어납니다. 처음에는 1장·비용 절약형을 권장합니다.</p>
                </div>
              </>
            ) : null}
          </div></div></section>
<PostDecorationFields value={decorations} onChange={setDecorations} />
          <details className="new-post-summary-section summary-disclosure">
            <summary>입력 내용 한눈에 보기</summary>
            <h3 id="new-post-summary-heading">이번 글 요약</h3>
            <dl className="new-post-summary-list">
              <div><dt>브랜드</dt><dd>{isProfileLoading ? '불러오는 중…' : brandName || '입력 필요'}</dd></div>
              <div><dt>상품·서비스</dt><dd>{selectedService || '지정하지 않음'}</dd></div>
              <div><dt>글 유형</dt><dd>{articleType || '선택 전'}</dd></div>
              <div><dt>GPT 모델</dt><dd>{selectedModel?.displayName || '선택 전'}</dd></div>
              <div><dt>추론 강도</dt><dd>{reasoningEffort ? reasoningEffortLabels[reasoningEffort] : '선택 전'}</dd></div>
              <div><dt>목표 글자 수</dt><dd>{targetLength.toLocaleString('ko-KR')}자 ±10%</dd></div>
              <div><dt>기본 키워드</dt><dd>{keywords[0]?.value.trim() || '입력 전'}</dd></div>
              <div><dt>보조 키워드</dt><dd>{Math.max(0, keywords.length - 1)}개</dd></div>
              <div>
                <dt>AI 이미지</dt>
                <dd>
                  {useGeneratedImages
                    ? `${imageCount}장 · ${imageAspectRatio === 'landscape' ? '가로형' : imageAspectRatio === 'portrait' ? '세로형' : '정사각형'}`
                    : '사용 안 함'}
                </dd>
              </div>
            </dl>
          </details>


            <div className="new-post-actions compose-footer">
              <div><strong>설정을 마쳤나요?</strong><span>한 글은 바로 실행하고, 여러 글은 목록에 차례대로 담으세요. 실행 시 OpenAI API 사용료가 발생합니다.</span></div>
              <div className="new-post-action-buttons">
                <button className="button secondary" type="submit" disabled={isTopicRecommending}>
                  <Plus aria-hidden="true" />{editingId ? '설정 수정 저장' : '목록에 추가'}
                </button>
                <button className="button primary" type="button" disabled={isTopicRecommending} onClick={() => saveSettings(true)}>
                  <Sparkles aria-hidden="true" />이 글 자동 작성·저장
                </button>
              </div>
            </div>
</fieldset>
</form>

    </div>
  );
}

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
import { supabase } from './supabase.js';
import type {
  BlogDraftVerification,
  GeneratedBlogDraft,
} from '../main/openai-generation.js';
import type {
  GeneratedBlogImage,
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
  onOpenBrandProfile,
  onPrepareNaverDraft,
}: {
  readonly userId: string;
  readonly onOpenBrandProfile: () => void;
  readonly onPrepareNaverDraft: (
    draft: GeneratedBlogDraft & {
      readonly images: readonly GeneratedBlogImage[];
    },
  ) => void;
}) {
  const [topic, setTopic] = useState('');
  const [articleType, setArticleType] = useState('');
  const [targetLength, setTargetLength] = useState(1_800);
  const [keywords, setKeywords] = useState<readonly KeywordRow[]>([{
    id: 'primary',
    value: '',
    repetitions: '3',
  }]);
  const [recommendationCount, setRecommendationCount] = useState(5);
  const [serviceSelection, setServiceSelection] = useState('');
  const [customService, setCustomService] = useState('');
  const [cta, setCta] = useState('');
  const [brandName, setBrandName] = useState('');
  const [serviceOptions, setServiceOptions] = useState<readonly string[]>([]);
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
  const [generationStatus, setGenerationStatus] = useState<
    'idle' | 'generating' | 'generatingImages' | 'complete' | 'error'
  >('idle');
  const [generationError, setGenerationError] = useState<string | null>(null);
  const [generationResult, setGenerationResult] = useState<{
    readonly draft: GeneratedBlogDraft;
    readonly verification: BlogDraftVerification;
  } | null>(null);
  const [useGeneratedImages, setUseGeneratedImages] = useState(false);
  const [imageCount, setImageCount] = useState(1);
  const [imageAspectRatio, setImageAspectRatio] = useState<ImageAspectRatio>('landscape');
  const [imageQualityMode, setImageQualityMode] = useState<ImageQualityMode>('economy');
  const [imageStyle, setImageStyle] = useState('');
  const [imageGenerationStatus, setImageGenerationStatus] = useState<
    'idle' | 'generating' | 'complete' | 'error'
  >('idle');
  const [imageGenerationError, setImageGenerationError] = useState<string | null>(null);
  const [generatedImages, setGeneratedImages] = useState<readonly GeneratedBlogImage[]>([]);
  const keywordSequence = useRef(0);
  const resultRef = useRef<HTMLElement>(null);

  useEffect(() => {
    let active = true;

    void window.blowBrandProfile.get(userId).then((response) => {
      if (!active) return;

      if (response.ok && response.profile) {
        setBrandName(response.profile.brandName);
        setServiceOptions(parseProductOptions(response.profile.productsAndServices));
        setCta(response.profile.defaultCta);
      } else if (!response.ok) {
        setProfileError(response.error.message);
      }
      setIsProfileLoading(false);
    });

    return () => {
      active = false;
    };
  }, [userId]);

  useEffect(() => {
    let active = true;

    const loadModels = async (): Promise<void> => {
      setModelStatus('loading');
      setModelError(null);

      if (!supabase) {
        if (active) {
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

      if (!active) return;

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
      active = false;
    };
  }, [modelReloadToken, userId]);

  const selectedService = serviceSelection === '__custom__'
    ? customService.trim()
    : serviceSelection;
  const selectedModel = selectableModels.find((model) => model.modelId === modelId);
  const hasErrors = hasCoreDraftErrors(errors);
  const showKeywordWarning = hasExcessiveKeywords(keywords);
  const isGenerating = generationStatus === 'generating'
    || generationStatus === 'generatingImages';

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

  const resetImageResult = (): void => {
    setImageGenerationStatus('idle');
    setImageGenerationError(null);
    setGeneratedImages([]);
    setNotice(null);
  };

  const generateImagesForDraft = async (
    draft: GeneratedBlogDraft,
  ): Promise<void> => {
    setGenerationStatus('generatingImages');
    setImageGenerationStatus('generating');
    setImageGenerationError(null);
    setNotice(null);

    try {
      const response = await window.blowOpenAi.generateImages({
        userId,
        topic: topic.trim(),
        articleTitle: draft.title,
        articleBody: draft.body,
        count: imageCount,
        aspectRatio: imageAspectRatio,
        qualityMode: imageQualityMode,
        style: imageStyle.trim(),
      });

      if (!response.ok) {
        setGenerationStatus('complete');
        setImageGenerationStatus('error');
        setImageGenerationError(response.message);
        return;
      }

      setGeneratedImages(response.images);
      setImageGenerationStatus('complete');
      setGenerationStatus('complete');
      setNotice(`제목과 본문, 이미지 ${response.images.length}장을 생성했습니다.`);
      window.setTimeout(() => resultRef.current?.focus(), 0);
    } catch {
      setGenerationStatus('complete');
      setImageGenerationStatus('error');
      setImageGenerationError('프로그램을 다시 연 뒤 이미지만 다시 생성해 주세요.');
    }
  };

  const submit = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    const nextErrors = validateCoreDraft({
      topic,
      articleType,
      modelId,
      reasoningEffort,
      keywords,
    });
    setErrors(nextErrors);
    setNotice(null);
    setGenerationError(null);

    if (hasCoreDraftErrors(nextErrors)) {
      const firstKeywordErrorIndex = nextErrors.keywords?.findIndex(
        (keyword) => keyword.value || keyword.repetitions,
      ) ?? -1;
      const firstKeywordError = firstKeywordErrorIndex >= 0
        ? nextErrors.keywords?.[firstKeywordErrorIndex]
        : undefined;
      const firstInvalidId = nextErrors.topic
        ? 'new-post-topic'
        : nextErrors.articleType
          ? 'new-post-article-type'
          : nextErrors.modelId
            ? 'new-post-model'
            : nextErrors.reasoningEffort
              ? 'new-post-reasoning'
              : firstKeywordError?.value
                ? `new-post-keyword-${firstKeywordErrorIndex}`
                : `new-post-repetitions-${firstKeywordErrorIndex}`;
      document.getElementById(firstInvalidId)?.focus();
      return;
    }

    if (!brandName) {
      setGenerationStatus('error');
      setGenerationError('먼저 브랜드 프로필의 필수 정보를 저장해 주세요.');
      return;
    }

    setGenerationStatus('generating');
    setImageGenerationStatus('idle');
    setImageGenerationError(null);
    setGeneratedImages([]);

    try {
      const response = await window.blowOpenAi.generateDraft({
        userId,
        topic: topic.trim(),
        articleType,
        targetLength,
        keywords: keywords.map((keyword) => ({
          value: keyword.value.trim(),
          repetitions: Number(keyword.repetitions),
        })),
        service: selectedService,
        cta: cta.trim(),
        modelId,
        reasoningEffort,
      });

      if (!response.ok) {
        setGenerationStatus('error');
        setGenerationError(response.message);
        return;
      }

      setGenerationResult({
        draft: response.draft,
        verification: response.verification,
      });

      if (useGeneratedImages) {
        await generateImagesForDraft(response.draft);
        return;
      }

      setGenerationStatus('complete');
      setNotice(response.verification.valid
        ? '제목과 본문을 생성하고 권장 기준을 충족했습니다.'
        : '제목과 본문을 생성했습니다. 권장 기준을 벗어난 항목을 확인해 주세요.');
      window.setTimeout(() => resultRef.current?.focus(), 0);
    } catch {
      setGenerationStatus('error');
      setGenerationError('프로그램을 다시 연 뒤 글 생성을 다시 시도해 주세요.');
    }
  };

  const cancelGeneration = async (): Promise<void> => {
    try {
      await window.blowOpenAi.cancelGeneration();
    } catch {
      setGenerationStatus('error');
      setGenerationError('작업을 중단하지 못했습니다. 프로그램을 다시 열어 주세요.');
    }
  };

  return (
    <>
      <header className="page-head">
        <div>
          <h1>새 글 작성</h1>
          <p>먼저 글의 핵심을 정하고, 다음 단계에서 표현과 이미지 설정을 이어갑니다.</p>
        </div>
      </header>

      {hasErrors ? (
        <div className="message error-message" role="alert">
          <XCircle aria-hidden="true" />
          <div>
            <h2>입력 내용을 확인해 주세요</h2>
            <p>표시된 필수 항목과 키워드 규칙을 수정한 뒤 다시 확인해 주세요.</p>
          </div>
        </div>
      ) : null}

      {isGenerating ? (
        <div className="message new-post-generation-progress" role="status" aria-live="polite">
          <LoaderCircle className="is-spinning" aria-hidden="true" />
          <div>
            <h2>
              {generationStatus === 'generatingImages'
                ? '글에 사용할 이미지를 만들고 있습니다'
                : '제목과 본문을 작성하고 있습니다'}
            </h2>
            <p>완료될 때까지 이 화면을 열어 두세요. 정확한 남은 시간은 표시하지 않습니다.</p>
          </div>
        </div>
      ) : null}

      {generationError ? (
        <div className="message error-message" role="alert">
          <XCircle aria-hidden="true" />
          <div>
            <h2>글을 생성하지 못했습니다</h2>
            <p>{generationError}</p>
          </div>
        </div>
      ) : null}

      {notice ? (
        <div className="message success-message" role="status">
          <CheckCircle2 aria-hidden="true" />
          <div>
            <h2>글 생성 완료</h2>
            <p>{notice}</p>
          </div>
        </div>
      ) : null}

      <section className="connection-workbench new-post-workbench" aria-labelledby="new-post-heading">
        <div className="connection-form-panel">
          <header className="panel-heading compact">
            <div>
              <h2 id="new-post-heading">글의 핵심</h2>
              <p>현재 글에 실제로 사용할 내용만 입력해 주세요.</p>
            </div>
          </header>

          <form
            id="new-post-form"
            className="connection-form new-post-form"
            aria-busy={isGenerating}
            noValidate
            onSubmit={(event) => void submit(event)}
          >
            <div className="field-group">
              <label htmlFor="new-post-topic">주제 또는 작성 요청 <span>필수</span></label>
              <textarea
                id="new-post-topic"
                className="new-post-topic"
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
                  <option key={service} value={service}>{service}</option>
                ))}
                <option value="__custom__">직접 입력</option>
              </select>
              <p className="field-help">선택한 항목만 이번 글에 우선 반영합니다.</p>
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
            ) : null}

            <div className="new-post-grid">
              <div className="field-group">
                <label htmlFor="new-post-article-type">글 유형 <span>필수</span></label>
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

              <div className="field-group">
                <label htmlFor="new-post-target-length">목표 글자 수 <span>공백 제외</span></label>
                <select
                  id="new-post-target-length"
                  value={targetLength}
                  onChange={(event) => {
                    setTargetLength(Number(event.target.value));
                    setNotice(null);
                  }}
                >
                  {[1_200, 1_800, 2_500].map((length) => (
                    <option key={length} value={length}>{length.toLocaleString('ko-KR')}자</option>
                  ))}
                </select>
                <p className="field-help">생성 결과의 허용 범위는 목표값의 ±10%입니다.</p>
              </div>
            </div>

            <fieldset className="new-post-keywords">
              <legend>키워드</legend>
              <p className="field-help">기본 키워드는 제목에 정확히 한 번, 모든 키워드는 본문에 지정한 횟수만큼 사용합니다.</p>

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

              <details className="new-post-keyword-recommendation">
                <summary>
                  <Sparkles aria-hidden="true" />
                  GPT 키워드 추천
                  <span>선택</span>
                </summary>
                <div className="new-post-recommendation-body">
                  <div className="field-group">
                    <label htmlFor="new-post-recommendation-count">추천 개수</label>
                    <select
                      id="new-post-recommendation-count"
                      value={recommendationCount}
                      onChange={(event) => setRecommendationCount(Number(event.target.value))}
                    >
                      {[3, 5, 8].map((count) => (
                        <option key={count} value={count}>{count}개</option>
                      ))}
                    </select>
                  </div>
                  <div className="new-post-recommendation-copy">
                    <strong>{selectedModel && reasoningEffort ? 'AI 작성 설정 완료' : '먼저 AI 작성 설정을 완료해 주세요'}</strong>
                    <p>추천 결과를 바로 적용하지 않고, 선택·수정한 키워드만 위 목록에 추가할 예정입니다.</p>
                    <p id="new-post-recommendation-cost">추천 버튼을 누를 때만 본인의 OpenAI 계정에 API 사용료가 발생할 수 있습니다.</p>
                  </div>
                  <button
                    className="button secondary"
                    type="button"
                    disabled
                    aria-describedby="new-post-recommendation-cost"
                  >
                    <Sparkles aria-hidden="true" />
                    다음 단계에서 추천 연결
                  </button>
                </div>
              </details>
            </fieldset>

            <details className="new-post-optional">
              <summary>CTA 설정 <span>선택</span></summary>
              <div className="field-group">
                <label htmlFor="new-post-cta">글 마지막 행동 유도 문구</label>
                <textarea
                  id="new-post-cta"
                  value={cta}
                  maxLength={300}
                  placeholder="예: 상담이 필요하다면 편하게 문의해 주세요."
                  onChange={(event) => {
                    setCta(event.target.value);
                    setNotice(null);
                  }}
                />
                <p className="field-help">입력한 문구는 바꾸지 않고 글 마지막에 한 번 사용합니다.</p>
              </div>
            </details>

            <div className="new-post-actions">
              <div>
                <strong>OpenAI API 사용료 안내</strong>
                <span>버튼을 누르면 입력 내용과 브랜드 정보가 OpenAI로 전송되며 본인 계정에 API 사용료가 발생할 수 있습니다. 민감정보는 입력하지 마세요.</span>
              </div>
              <div className="new-post-action-buttons">
                {isGenerating ? (
                  <button
                    className="button danger"
                    type="button"
                    onClick={() => void cancelGeneration()}
                  >
                    <XCircle aria-hidden="true" />
                    작업 중단
                  </button>
                ) : null}
                <button
                  className="button primary"
                  type="submit"
                  disabled={isGenerating}
                >
                  {isGenerating ? (
                    <LoaderCircle className="is-spinning" aria-hidden="true" />
                  ) : (
                    <Sparkles aria-hidden="true" />
                  )}
                  {isGenerating ? '생성 중…' : '글 생성 시작'}
                </button>
              </div>
            </div>
          </form>
        </div>

        <aside className="connection-progress new-post-summary" aria-label="AI 작성 설정과 이번 글 요약">
          <header className="panel-heading compact">
            <div>
              <h2>AI 작성 설정</h2>
              <p>이번 글에 사용할 모델과 답을 준비하는 깊이를 선택합니다.</p>
            </div>
          </header>

          <section className="new-post-model-settings" aria-labelledby="new-post-model-heading">
            <h3 id="new-post-model-heading">GPT 모델</h3>

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
              <label htmlFor="new-post-model">사용할 GPT 모델 <span>필수</span></label>
              <select
                id="new-post-model"
                form="new-post-form"
                value={modelId}
                required
                disabled={modelStatus !== 'ready'}
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
                BLOW가 승인했고 현재 API 키로 사용할 수 있는 모델만 표시합니다.
              </p>
              {errors.modelId ? (
                <p id="new-post-model-error" className="field-error">{errors.modelId}</p>
              ) : null}
            </div>

            <div className="field-group">
              <label htmlFor="new-post-reasoning">추론 강도 <span>필수</span></label>
              <select
                id="new-post-reasoning"
                form="new-post-form"
                value={reasoningEffort}
                required
                disabled={!selectedModel}
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
                <option value="">{selectedModel ? '추론 강도를 선택해 주세요' : '먼저 모델을 선택해 주세요'}</option>
                {selectedModel?.allowedReasoningEfforts.map((effort) => (
                  <option key={effort} value={effort}>
                    {reasoningEffortLabels[effort]}{effort === 'medium' ? ' (권장)' : ''}
                  </option>
                ))}
              </select>
              <p id="new-post-reasoning-help" className="field-help">
                AI가 답을 준비하며 검토하는 깊이입니다. 대부분의 글에는 ‘중간’을 권장합니다.
              </p>
              {errors.reasoningEffort ? (
                <p id="new-post-reasoning-error" className="field-error">{errors.reasoningEffort}</p>
              ) : null}
            </div>

            {selectedModel ? (
              <article className="new-post-model-card">
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
              </article>
            ) : null}

            {modelNotice ? <p className="new-post-model-notice" role="status">{modelNotice}</p> : null}

            <div className="connection-note new-post-cost-note">
              <FilePenLine aria-hidden="true" />
              <p>모델 확인과 선택만으로 콘텐츠 생성 비용은 발생하지 않습니다. 실제 추천·생성 버튼을 누를 때만 본인의 OpenAI 계정에 API 사용료가 발생할 수 있습니다.</p>
            </div>
          </section>

          <section className="new-post-image-settings" aria-labelledby="new-post-image-heading">
            <div>
              <h3 id="new-post-image-heading">AI 이미지</h3>
              <p>글을 만든 뒤 이미지를 이어서 생성합니다. AI가 만든 글은 목표 분량 ±10%를 간혹 벗어날 수 있습니다.</p>
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
                    <p className="field-help">이번 검증 단계에서는 한 번에 최대 4장을 생성합니다.</p>
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
                  <p className="field-help">비워 두면 브랜드 프로필에 저장한 이미지 스타일을 사용합니다.</p>
                </div>

                <div className="connection-note new-post-image-cost-note">
                  <ImageIcon aria-hidden="true" />
                  <p>이미지 장수와 품질에 따라 본인의 OpenAI API 비용과 처리 시간이 늘어납니다. 첫 테스트는 1장·비용 절약형을 권장합니다.</p>
                </div>
              </>
            ) : null}
          </section>

          <section className="new-post-summary-section" aria-labelledby="new-post-summary-heading">
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
          </section>

          {!isProfileLoading && !brandName ? (
            <div className="new-post-profile-warning">
              <CircleAlert aria-hidden="true" />
              <div>
                <strong>브랜드 프로필이 비어 있습니다</strong>
                <p>실제 글을 만들기 전 브랜드 기본 정보를 먼저 저장해 주세요.</p>
                <button className="button secondary" type="button" onClick={onOpenBrandProfile}>
                  브랜드 프로필 입력
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
        </aside>
      </section>

      {generationResult ? (
        <section
          ref={resultRef}
          className="new-post-generation-result"
          aria-labelledby="new-post-generation-result-heading"
          tabIndex={-1}
        >
          <header className="new-post-result-head">
            <div>
              <h2 id="new-post-generation-result-heading">생성된 글</h2>
              <p>네이버에 입력하기 전에 내용과 사실관계를 직접 확인해 주세요.</p>
            </div>
            <span className={generationResult.verification.valid ? 'is-valid' : 'needs-review'}>
              {generationResult.verification.valid ? '권장 기준 충족' : '일부 항목 확인'}
            </span>
          </header>

          {!generationResult.verification.valid ? (
            <div className="new-post-result-warning" role="status">
              <CircleAlert aria-hidden="true" />
              <div>
                <h3>일부 권장 기준을 벗어났습니다</h3>
                <p>AI 생성 결과는 목표 범위를 간혹 벗어날 수 있습니다. 아래 항목을 확인하고 필요하면 네이버에서 수정해 주세요.</p>
                <ul>
                  {generationResult.verification.issues.map((issue) => (
                    <li key={issue}>{issue}</li>
                  ))}
                </ul>
              </div>
            </div>
          ) : null}

          <dl className="new-post-result-metrics">
            <div>
              <dt>제목</dt>
              <dd>{generationResult.verification.titleLength}/30자</dd>
            </div>
            <div>
              <dt>본문</dt>
              <dd>
                {generationResult.verification.bodyLength.toLocaleString('ko-KR')}자
                {' · '}
                목표 {generationResult.verification.minimumBodyLength.toLocaleString('ko-KR')}–{generationResult.verification.maximumBodyLength.toLocaleString('ko-KR')}자
              </dd>
            </div>
          </dl>

          <article className="new-post-result-article">
            <h3>{generationResult.draft.title}</h3>
            <div className="new-post-result-body">{generationResult.draft.body}</div>
          </article>

          {useGeneratedImages ? (
            <section className="new-post-image-result" aria-labelledby="new-post-image-result-heading">
              <header>
                <div>
                  <h3 id="new-post-image-result-heading">생성 이미지</h3>
                  <p>네이버에 입력하기 전에 사실성, 사용 권한과 업종별 표시 의무를 직접 확인해 주세요.</p>
                </div>
                {imageGenerationStatus === 'complete' ? (
                  <span>{generatedImages.length}장 완료</span>
                ) : null}
              </header>

              {imageGenerationStatus === 'generating' ? (
                <div className="new-post-image-result-status" role="status" aria-live="polite">
                  <LoaderCircle className="is-spinning" aria-hidden="true" />
                  <p>선택한 비율과 품질로 이미지를 만들고 있습니다.</p>
                </div>
              ) : null}

              {imageGenerationError ? (
                <div className="new-post-image-result-error" role="alert">
                  <CircleAlert aria-hidden="true" />
                  <div>
                    <strong>이미지를 생성하지 못했습니다</strong>
                    <p>{imageGenerationError}</p>
                    <button
                      className="button secondary"
                      type="button"
                      disabled={isGenerating}
                      onClick={() => void generateImagesForDraft(generationResult.draft)}
                    >
                      <ImageIcon aria-hidden="true" />
                      이미지만 다시 생성
                    </button>
                  </div>
                </div>
              ) : null}

              {imageGenerationStatus === 'idle' ? (
                <div className="new-post-image-result-empty">
                  <p>이미지 설정이 변경됐습니다. 현재 글은 다시 만들지 않고 이미지만 생성할 수 있습니다.</p>
                  <button
                    className="button secondary"
                    type="button"
                    onClick={() => void generateImagesForDraft(generationResult.draft)}
                  >
                    <ImageIcon aria-hidden="true" />
                    이미지만 생성
                  </button>
                </div>
              ) : null}

              {generatedImages.length > 0 ? (
                <div className={`new-post-image-preview-grid is-${imageAspectRatio}`}>
                  {generatedImages.map((image, index) => (
                    <figure key={`${index}-${image.dataUrl.slice(-16)}`}>
                      <img
                        src={image.dataUrl}
                        alt={`AI 생성 이미지 ${index + 1} 미리보기`}
                        loading="lazy"
                      />
                      <figcaption>이미지 {index + 1}</figcaption>
                    </figure>
                  ))}
                </div>
              ) : null}
            </section>
          ) : null}

          <div className="new-post-result-review-note">
            <CircleAlert aria-hidden="true" />
            <p>자동 검사는 글자 수·키워드·CTA 형식만 확인합니다. 가격, 경력, 통계, 광고 표현과 업종별 규정은 발행 전에 직접 확인해야 합니다.</p>
          </div>

          <div className="new-post-result-transfer">
            <div>
              <strong>네이버 입력 준비</strong>
              <span>생성된 제목, 본문과 이미지를 네이버 연결 화면으로 옮깁니다. 이 버튼만으로 Chrome 조작이나 임시저장은 실행되지 않습니다.</span>
            </div>
            <button
              className="button primary"
              type="button"
              disabled={isGenerating}
              onClick={() => onPrepareNaverDraft({
                ...generationResult.draft,
                images: generatedImages,
              })}
            >
              <FilePenLine aria-hidden="true" />
              네이버 입력 준비
            </button>
          </div>
        </section>
      ) : null}
    </>
  );
}

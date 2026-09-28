export interface KeywordDraft {
  readonly value: string;
  readonly repetitions: string;
}

export interface KeywordDraftErrors {
  readonly value?: string | undefined;
  readonly repetitions?: string | undefined;
}

export interface CoreDraft {
  readonly topic: string;
  readonly articleType: string;
  readonly modelId: string;
  readonly reasoningEffort: string;
  readonly keywords: readonly KeywordDraft[];
}

export interface CoreDraftErrors {
  readonly topic?: string | undefined;
  readonly articleType?: string | undefined;
  readonly modelId?: string | undefined;
  readonly reasoningEffort?: string | undefined;
  readonly keywords?: readonly KeywordDraftErrors[] | undefined;
}

export { parseProductOptions } from '../shared/product-services.js';

export function validateCoreDraft(draft: CoreDraft): CoreDraftErrors {
  const normalizedKeywords = draft.keywords.map((keyword) =>
    keyword.value.trim().toLocaleLowerCase('ko-KR'),
  );
  const duplicateKeywords = new Set(
    normalizedKeywords.filter((keyword, index) =>
      Boolean(keyword) && normalizedKeywords.indexOf(keyword) !== index,
    ),
  );

  return {
    topic: draft.topic.trim() ? undefined : '글의 주제를 입력해 주세요.',
    articleType: draft.articleType ? undefined : '글 유형을 선택해 주세요.',
    modelId: draft.modelId ? undefined : '사용할 GPT 모델을 선택해 주세요.',
    reasoningEffort: draft.reasoningEffort ? undefined : '추론 강도를 선택해 주세요.',
    keywords: draft.keywords.map((keyword, index) => {
      const value = keyword.value.trim();
      const repetitions = Number(keyword.repetitions);
      const normalizedKeyword = normalizedKeywords[index];

      return {
        value: !value
          ? index === 0
            ? '기본 키워드를 입력해 주세요.'
            : '보조 키워드를 입력하거나 이 행을 삭제해 주세요.'
          : index === 0 && value.length > 30
            ? '기본 키워드는 제목 제한인 30자 이하여야 합니다.'
            : normalizedKeyword && duplicateKeywords.has(normalizedKeyword)
              ? '같은 키워드가 두 번 입력되었습니다.'
              : undefined,
        repetitions: Number.isInteger(repetitions) && repetitions >= 1
          ? undefined
          : '반복 횟수는 1 이상의 정수로 입력해 주세요.',
      };
    }),
  };
}

export function hasCoreDraftErrors(errors: CoreDraftErrors): boolean {
  return Boolean(
    errors.topic ||
    errors.articleType ||
    errors.modelId ||
    errors.reasoningEffort ||
    errors.keywords?.some((keyword) => keyword.value || keyword.repetitions),
  );
}

export function hasExcessiveKeywords(keywords: readonly KeywordDraft[]): boolean {
  return keywords.length > 10;
}

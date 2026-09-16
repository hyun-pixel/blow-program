import { describe, expect, it } from 'vitest';
import {
  hasCoreDraftErrors,
  hasExcessiveKeywords,
  parseProductOptions,
  validateCoreDraft,
} from './new-post-draft.js';

describe('new post core input', () => {
  it('turns line-separated profile products into unique choices', () => {
    expect(parseProductOptions(' 실손보험 상담\n자동차보험 상담\n실손보험 상담 '))
      .toEqual(['실손보험 상담', '자동차보험 상담']);
  });

  it('accepts a complete draft with primary and secondary keywords', () => {
    const errors = validateCoreDraft({
      topic: '보험 가입 전 확인할 내용을 설명해 주세요.',
      articleType: '정보형',
      modelId: 'gpt-5.6-terra',
      reasoningEffort: 'medium',
      keywords: [
        { value: '실손보험', repetitions: '3' },
        { value: '보장 범위', repetitions: '2' },
      ],
    });

    expect(errors).toEqual({
      topic: undefined,
      articleType: undefined,
      modelId: undefined,
      reasoningEffort: undefined,
      keywords: [
        { value: undefined, repetitions: undefined },
        { value: undefined, repetitions: undefined },
      ],
    });
    expect(hasCoreDraftErrors(errors)).toBe(false);
  });

  it('rejects missing fields and an invalid repetition count', () => {
    const result = validateCoreDraft({
      topic: '',
      articleType: '',
      modelId: '',
      reasoningEffort: '',
      keywords: [{ value: '', repetitions: '0' }],
    });

    expect(result.topic).toContain('주제');
    expect(result.articleType).toContain('글 유형');
    expect(result.modelId).toContain('GPT 모델');
    expect(result.reasoningEffort).toContain('추론 강도');
    expect(result.keywords?.[0]?.value).toContain('기본 키워드');
    expect(result.keywords?.[0]?.repetitions).toContain('1 이상');
    expect(hasCoreDraftErrors(result)).toBe(true);
  });

  it('marks every duplicate keyword regardless of spacing or letter case', () => {
    const result = validateCoreDraft({
      topic: '보험 안내',
      articleType: '정보형',
      modelId: 'gpt-5.6-terra',
      reasoningEffort: 'medium',
      keywords: [
        { value: 'Insurance', repetitions: '3' },
        { value: ' insurance ', repetitions: '2' },
      ],
    });

    expect(result.keywords?.[0]?.value).toContain('두 번');
    expect(result.keywords?.[1]?.value).toContain('두 번');
  });

  it('warns without blocking when more than ten keywords are entered', () => {
    const keywords = Array.from({ length: 11 }, (_, index) => ({
      value: `키워드 ${index + 1}`,
      repetitions: '1',
    }));

    expect(hasExcessiveKeywords(keywords)).toBe(true);
    expect(hasExcessiveKeywords(keywords.slice(0, 10))).toBe(false);
  });
});

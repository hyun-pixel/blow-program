import { describe, expect, it } from 'vitest';
import type { BrandProfile } from './brand-profile.js';
import {
  generateOpenAiBlogDraft,
  normalizeBlogGenerationRequest,
  verifyGeneratedBlogDraft,
} from './openai-generation.js';

const profile: BrandProfile = {
  brandName: '테스트 브랜드',
  industry: '보험 상담',
  brandIntroduction: '복잡한 보험 내용을 쉽게 설명합니다.',
  productsAndServices: '실손보험 상담',
  contentDirection: '쉬운 정보형 글',
  activityRegion: '서울',
  priceInfo: '',
  businessHours: '',
  coreStrengths: '쉬운 설명',
  targetCustomers: '보험을 처음 알아보는 고객',
  mustEmphasize: '개인별 조건이 다를 수 있음',
  prohibitedPhrases: '100% 보장',
  requiredPhrases: '',
  defaultCta: '',
  defaultTone: '친절하고 차분한 말투',
  accentColor: '',
  imageStyle: '',
  phoneNumber: '',
  address: '',
  consultationLink: '',
  updatedAt: '2026-09-13T00:00:00.000Z',
};

const generationRequest = {
  userId: '8573e7bb-9257-49bc-a419-6f0f5ad9f1fb',
  topic: '실손보험 가입 전에 확인할 내용을 설명해 주세요.',
  articleType: '정보형',
  targetLength: 1_200,
  keywords: [{ value: '실손보험', repetitions: 3 }],
  service: '실손보험 상담',
  cta: '',
  modelId: 'gpt-5.6-terra',
  reasoningEffort: 'medium',
} as const;

function makeValidBody(): string {
  const keywordText = generationRequest.keywords[0].value.repeat(3);
  return `${keywordText}${'가'.repeat(1_200 - [...keywordText].length)}`;
}

describe('OpenAI blog generation', () => {
  it('rejects unsupported generation settings before making a request', () => {
    expect(() => normalizeBlogGenerationRequest({
      ...generationRequest,
      targetLength: 999,
    })).toThrow('입력값');
  });

  it('checks title, body length, keyword counts, and the exact CTA', () => {
    const body = makeValidBody();
    const verification = verifyGeneratedBlogDraft(
      { title: '실손보험 가입 전 확인사항', body },
      generationRequest,
    );

    expect(verification.valid).toBe(true);
    expect(verification.bodyLength).toBe(1_200);

    expect(verifyGeneratedBlogDraft(
      { title: '가입 전 확인사항', body: `${body}추가 문장` },
      { ...generationRequest, cta: '상담을 신청해 주세요.' },
    ).issues).toEqual(expect.arrayContaining([
      expect.stringContaining('기본 키워드'),
      expect.stringContaining('CTA'),
    ]));

    const longDraft = verifyGeneratedBlogDraft(
      { title: '실손보험 가입 전 확인사항', body: `${body}${'나'.repeat(423)}` },
      generationRequest,
    );
    expect(longDraft.valid).toBe(false);
    expect(longDraft.issues).toEqual(expect.arrayContaining([
      expect.stringContaining('목표 범위 1,080–1,320자'),
    ]));
  });

  it('uses the Responses API without server-side response storage', async () => {
    let requestedUrl = '';
    let requestedBody: Record<string, unknown> = {};
    let requestCount = 0;
    const body = makeValidBody();

    const result = await generateOpenAiBlogDraft(
      'sk-test-key-that-is-long-enough',
      generationRequest,
      profile,
      async (input, init) => {
        requestCount += 1;
        requestedUrl = String(input);
        requestedBody = JSON.parse(String(init?.body)) as Record<string, unknown>;
        return {
          ok: true,
          status: 200,
          json: async () => ({
            status: 'completed',
            output_text: JSON.stringify({
              title: '실손보험 가입 전 확인사항',
              body,
            }),
          }),
        } as Response;
      },
    );

    expect(result.ok).toBe(true);
    expect(requestedUrl).toBe('https://api.openai.com/v1/responses');
    expect(requestedBody).toMatchObject({
      model: 'gpt-5.6-terra',
      reasoning: { effort: 'medium' },
      store: false,
    });
    expect(requestedBody.text).toMatchObject({
      format: { type: 'json_schema', strict: true },
      verbosity: 'high',
    });
    expect(requestedBody.instructions).toEqual(expect.stringContaining('1080–1320자'));
    expect(requestedBody.instructions).toEqual(expect.stringContaining('1200자 안팎'));
    expect(requestedBody.instructions).toEqual(expect.stringContaining('1284자를 넘기지 마세요'));
    expect(requestedBody.instructions).toEqual(expect.stringContaining('제목의 사용 횟수를 본문 횟수에 합산하지 마세요'));
    expect(requestedBody.instructions).toEqual(expect.stringContaining('직접 점검'));
    expect(JSON.parse(String(requestedBody.input))).toMatchObject({
      '본문 키워드 정확 횟수': [{
        '문자열(수정 금지)': '실손보험',
        '본문 사용 횟수': 3,
      }],
    });
    expect(requestCount).toBe(1);
    expect(JSON.stringify(requestedBody)).not.toContain('sk-test-key');
  });

  it('returns a safe recovery message for an API limit error', async () => {
    await expect(generateOpenAiBlogDraft(
      'sk-test-key-that-is-long-enough',
      generationRequest,
      profile,
      async () => ({ ok: false, status: 429 }) as Response,
    )).resolves.toEqual({
      ok: false,
      code: 'RATE_LIMITED',
      message: 'OpenAI API 이용 한도 또는 결제 상태를 확인한 뒤 다시 시도해 주세요.',
    });
  });
});

import { describe, expect, it } from 'vitest';
import type { BrandProfile } from './brand-profile.js';
import {
  decodeGeneratedBlogImageDataUrl,
  generateOpenAiBlogImages,
  normalizeBlogImageGenerationRequest,
} from './openai-image-generation.js';

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
  imageStyle: '밝고 자연스러운 사진',
  phoneNumber: '',
  address: '',
  consultationLink: '',
  updatedAt: '2026-09-13T00:00:00.000Z',
};

const imageRequest = {
  userId: '8573e7bb-9257-49bc-a419-6f0f5ad9f1fb',
  topic: '실손보험 가입 전에 확인할 내용',
  articleTitle: '실손보험 가입 전 확인사항',
  articleBody: '보험을 준비할 때 확인할 내용을 설명합니다.',
  count: 2,
  aspectRatio: 'landscape',
  qualityMode: 'economy',
  style: '밝은 상담 공간',
} as const;

describe('OpenAI blog image generation', () => {
  it('accepts only bounded JPEG data URLs for local Naver attachment', () => {
    const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xdb, 0x00, 0x01]);

    expect(decodeGeneratedBlogImageDataUrl(
      `data:image/jpeg;base64,${jpeg.toString('base64')}`,
    )).toEqual(jpeg);
    expect(() => decodeGeneratedBlogImageDataUrl(
      `data:image/png;base64,${jpeg.toString('base64')}`,
    )).toThrow('형식');
  });

  it('rejects unsupported image settings before making a request', () => {
    expect(() => normalizeBlogImageGenerationRequest({
      ...imageRequest,
      count: 5,
    })).toThrow('설정');
  });

  it('uses the Image API and returns JPEG data URLs', async () => {
    let requestedUrl = '';
    let requestedBody: Record<string, unknown> = {};

    const result = await generateOpenAiBlogImages(
      'sk-test-key-that-is-long-enough',
      imageRequest,
      profile,
      async (input, init) => {
        requestedUrl = String(input);
        requestedBody = JSON.parse(String(init?.body)) as Record<string, unknown>;
        return {
          ok: true,
          status: 200,
          json: async () => ({
            data: [{ b64_json: 'first' }, { b64_json: 'second' }],
          }),
        } as Response;
      },
    );

    expect(result).toEqual({
      ok: true,
      images: [
        { dataUrl: 'data:image/jpeg;base64,first' },
        { dataUrl: 'data:image/jpeg;base64,second' },
      ],
    });
    expect(requestedUrl).toBe('https://api.openai.com/v1/images/generations');
    expect(requestedBody).toMatchObject({
      model: 'gpt-image-2.5-flare',
      n: 2,
      size: '1536x1024',
      quality: 'low',
      output_format: 'jpeg',
    });
    expect(requestedBody.prompt).not.toContain(profile.imageStyle);
    expect(requestedBody.prompt).toContain(imageRequest.style);
    expect(JSON.stringify(requestedBody)).not.toContain('sk-test-key');
  });

  it('uses the precision model for the high-quality mode', async () => {
    let requestedBody: Record<string, unknown> = {};

    await generateOpenAiBlogImages(
      'sk-test-key-that-is-long-enough',
      { ...imageRequest, count: 1, qualityMode: 'quality' },
      profile,
      async (_input, init) => {
        requestedBody = JSON.parse(String(init?.body)) as Record<string, unknown>;
        return {
          ok: true,
          status: 200,
          json: async () => ({ data: [{ b64_json: 'image' }] }),
        } as Response;
      },
    );

    expect(requestedBody).toMatchObject({
      model: 'gpt-image-2.5-sunburst',
      quality: 'high',
    });
  });

  it('keeps errors safe when image permission is missing', async () => {
    await expect(generateOpenAiBlogImages(
      'sk-test-key-that-is-long-enough',
      imageRequest,
      profile,
      async () => ({ ok: false, status: 403 }) as Response,
    )).resolves.toEqual({
      ok: false,
      code: 'AUTH_FAILED',
      message: 'OpenAI API 키의 Images 권한과 조직 인증 상태를 확인해 주세요.',
    });
  });
});

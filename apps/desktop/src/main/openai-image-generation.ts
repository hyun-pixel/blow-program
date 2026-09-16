import type { BrandProfile } from './brand-profile.js';

const aspectRatioSizes = {
  square: '1024x1024',
  portrait: '1024x1536',
  landscape: '1536x1024',
} as const;

const qualityModes = {
  economy: { model: 'gpt-image-2.5-flare', quality: 'low' },
  quality: { model: 'gpt-image-2.5-sunburst', quality: 'high' },
} as const;

export type ImageAspectRatio = keyof typeof aspectRatioSizes;
export type ImageQualityMode = keyof typeof qualityModes;

export interface BlogImageGenerationRequest {
  readonly userId: string;
  readonly topic: string;
  readonly articleTitle: string;
  readonly articleBody: string;
  readonly count: number;
  readonly aspectRatio: ImageAspectRatio;
  readonly qualityMode: ImageQualityMode;
  readonly style: string;
}

interface NormalizedBlogImageGenerationRequest extends BlogImageGenerationRequest {}

export interface GeneratedBlogImage {
  readonly dataUrl: string;
}

export function decodeGeneratedBlogImageDataUrl(value: unknown): Buffer {
  const prefix = 'data:image/jpeg;base64,';

  if (
    typeof value !== 'string'
    || !value.startsWith(prefix)
    || value.length > 25_000_000
  ) {
    throw new Error('생성 이미지 형식을 확인해 주세요.');
  }

  const encoded = value.slice(prefix.length);

  if (!encoded || !/^[A-Za-z0-9+/]+={0,2}$/u.test(encoded)) {
    throw new Error('생성 이미지 형식을 확인해 주세요.');
  }

  const image = Buffer.from(encoded, 'base64');

  if (
    image.length < 4
    || image[0] !== 0xff
    || image[1] !== 0xd8
    || image[2] !== 0xff
  ) {
    throw new Error('생성 이미지 형식을 확인해 주세요.');
  }

  return image;
}

export type OpenAiImageGenerationResult =
  | { readonly ok: true; readonly images: readonly GeneratedBlogImage[] }
  | { readonly ok: false; readonly code: string; readonly message: string };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readText(
  source: Record<string, unknown>,
  field: string,
  maximumLength: number,
  required = false,
): string {
  const value = typeof source[field] === 'string' ? source[field].trim() : '';

  if ((required && !value) || value.length > maximumLength) {
    throw new Error('이미지 생성 입력값을 확인해 주세요.');
  }

  return value;
}

export function normalizeBlogImageGenerationRequest(
  input: unknown,
): NormalizedBlogImageGenerationRequest {
  if (!isRecord(input)) {
    throw new Error('이미지 생성 입력값을 확인해 주세요.');
  }

  const aspectRatio = input.aspectRatio;
  const qualityMode = input.qualityMode;
  const count = input.count;

  if (
    typeof aspectRatio !== 'string'
    || !(aspectRatio in aspectRatioSizes)
    || typeof qualityMode !== 'string'
    || !(qualityMode in qualityModes)
    || typeof count !== 'number'
    || !Number.isInteger(count)
    || count < 1
    || count > 4
  ) {
    throw new Error('이미지 생성 설정을 확인해 주세요.');
  }

  return {
    userId: readText(input, 'userId', 100, true),
    topic: readText(input, 'topic', 500, true),
    articleTitle: readText(input, 'articleTitle', 200, true),
    articleBody: readText(input, 'articleBody', 20_000, true),
    count,
    aspectRatio: aspectRatio as ImageAspectRatio,
    qualityMode: qualityMode as ImageQualityMode,
    style: readText(input, 'style', 500),
  };
}

function buildImagePrompt(
  input: NormalizedBlogImageGenerationRequest,
  profile: BrandProfile,
): string {
  return [
    '한국 네이버 브랜드 블로그 글에 사용할 사실적인 참고 이미지를 만드세요.',
    `글 주제: ${input.topic}`,
    `글 제목: ${input.articleTitle}`,
    `본문 참고: ${input.articleBody.slice(0, 6_000)}`,
    `브랜드명: ${profile.brandName}`,
    `업종: ${profile.industry}`,
    `브랜드·사업 소개: ${profile.brandIntroduction}`,
    `상품·서비스: ${profile.productsAndServices}`,
    `브랜드 이미지 스타일: ${profile.imageStyle || '자연스럽고 신뢰감 있는 사진'}`,
    input.style ? `이번 글의 추가 스타일: ${input.style}` : '',
    '이미지 안에 글자, 숫자, 로고, 워터마크, 문서, 증명서 또는 전후 비교 표시는 넣지 마세요.',
    '실제 고객, 실제 시술 결과 또는 실제 사건을 촬영한 증거처럼 보이게 만들지 마세요.',
  ].filter(Boolean).join('\n');
}

function readImages(payload: unknown, expectedCount: number): readonly GeneratedBlogImage[] | null {
  if (!isRecord(payload) || !Array.isArray(payload.data)) return null;

  const images = payload.data.flatMap((item) =>
    isRecord(item) && typeof item.b64_json === 'string' && item.b64_json
      ? [{ dataUrl: `data:image/jpeg;base64,${item.b64_json}` }]
      : [],
  );

  return images.length === expectedCount ? images : null;
}

function toSafeApiError(status: number): OpenAiImageGenerationResult {
  if (status === 401 || status === 403) {
    return {
      ok: false,
      code: 'AUTH_FAILED',
      message: 'OpenAI API 키의 Images 권한과 조직 인증 상태를 확인해 주세요.',
    };
  }

  if (status === 429) {
    return {
      ok: false,
      code: 'RATE_LIMITED',
      message: 'OpenAI API 이용 한도 또는 결제 상태를 확인한 뒤 이미지만 다시 생성해 주세요.',
    };
  }

  return {
    ok: false,
    code: 'SERVICE_ERROR',
    message: '이미지를 생성하지 못했습니다. 글은 유지되므로 잠시 후 이미지만 다시 생성해 주세요.',
  };
}

export async function generateOpenAiBlogImages(
  apiKey: string,
  rawInput: unknown,
  profile: BrandProfile,
  request: typeof fetch = fetch,
  signal?: AbortSignal,
): Promise<OpenAiImageGenerationResult> {
  const input = normalizeBlogImageGenerationRequest(rawInput);
  const mode = qualityModes[input.qualityMode];

  try {
    const response = await request('https://api.openai.com/v1/images/generations', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: mode.model,
        prompt: buildImagePrompt(input, profile),
        n: input.count,
        size: aspectRatioSizes[input.aspectRatio],
        quality: mode.quality,
        output_format: 'jpeg',
        output_compression: 85,
      }),
      signal: signal
        ? AbortSignal.any([signal, AbortSignal.timeout(300_000)])
        : AbortSignal.timeout(300_000),
    });

    if (!response.ok) return toSafeApiError(response.status);

    const images = readImages(await response.json(), input.count);

    if (!images) {
      return {
        ok: false,
        code: 'OUTPUT_INVALID',
        message: '생성된 이미지를 확인하지 못했습니다. 글은 유지되므로 이미지만 다시 생성해 주세요.',
      };
    }

    return { ok: true, images };
  } catch (error) {
    if (signal?.aborted || (error instanceof Error && error.name === 'AbortError')) {
      return {
        ok: false,
        code: 'CANCELLED',
        message: '이미지 생성을 중단했습니다. 이미 처리된 API 요청의 비용은 취소되지 않을 수 있습니다.',
      };
    }

    return {
      ok: false,
      code: 'NETWORK_ERROR',
      message: '인터넷 연결을 확인한 뒤 이미지만 다시 생성해 주세요.',
    };
  }
}

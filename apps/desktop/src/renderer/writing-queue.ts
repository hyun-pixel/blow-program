import { normalizeBlogGenerationRequest, type BlogGenerationRequest, type GeneratedBlogDraft } from '../main/openai-generation.js';
import type { ImageAspectRatio, ImageQualityMode } from '../main/openai-image-generation.js';
import { dividerChoices, quoteChoices, type PostDecorations } from './post-decoration.js';

export const MAX_WRITING_JOBS = 20;
export interface WritingConfig {
  readonly request: BlogGenerationRequest;
  readonly blogId: string;
  readonly modelName: string;
  readonly reasoningLabel: string;
  readonly decorations: PostDecorations;
  readonly images: { readonly enabled: boolean; readonly count: number; readonly aspectRatio: ImageAspectRatio; readonly qualityMode: ImageQualityMode; readonly style: string };
}
export interface WritingJob {
  readonly id: string;
  readonly config: WritingConfig;
  readonly status: 'queued' | 'running' | 'saved' | 'failed' | 'interrupted';
  readonly message: string;
  readonly draft?: GeneratedBlogDraft;
}

export function validateWritingConfig(config: WritingConfig, userId: string): void {
  const request = normalizeBlogGenerationRequest(config.request);
  if (request.userId !== userId || !/^[a-z0-9][a-z0-9._-]{1,49}$/i.test(config.blogId)) throw new Error('저장된 계정과 블로그를 확인해 주세요.');
  if (!config.modelName || !config.reasoningLabel) throw new Error('모델 설정을 다시 선택해 주세요.');
  const { images, decorations } = config;
  if (typeof images.enabled !== 'boolean' || !Number.isInteger(images.count) || images.count < 1 || images.count > 4
    || !['landscape', 'portrait', 'square'].includes(images.aspectRatio) || !['economy', 'quality'].includes(images.qualityMode)
    || typeof images.style !== 'string' || images.style.length > 500) throw new Error('이미지 설정을 확인해 주세요.');
  for (const kind of ['quote', 'sticker', 'divider'] as const) {
    const value = decorations[kind];
    if (typeof value.enabled !== 'boolean' || !Number.isInteger(value.count) || value.count < 1 || value.count > 10) throw new Error('꾸미기 횟수는 1–10회로 설정해 주세요.');
  }
  if (!dividerChoices.some(({ value }) => value === decorations.divider.style) || !quoteChoices.some(({ value }) => value === decorations.quote.style)
    || !['random', 'manual'].includes(decorations.sticker.categoryMode)) throw new Error('꾸미기 설정을 확인해 주세요.');
  if (decorations.sticker.enabled && decorations.sticker.categoryMode === 'manual' && !decorations.sticker.categoryLabel?.trim()) throw new Error('자동으로 사용할 스티커 묶음 이름을 입력해 주세요.');
}

const queueKey = (userId: string): string => `blow:writing-queue:v1:${userId}`;

// Only settings and generated text are stored, never API keys or image data.
// ponytail: a bounded, single-window local queue; this is not a cloud/background scheduler.
export function readWritingQueue(storage: Pick<Storage, 'getItem'>, userId: string): WritingJob[] {
  const raw = storage.getItem(queueKey(userId));
  if (!raw) return [];
  try {
    const jobs: WritingJob[] = JSON.parse(raw);
    if (!Array.isArray(jobs) || jobs.length > MAX_WRITING_JOBS || new Set(jobs.map(({ id }) => id)).size !== jobs.length) throw new Error();
    return jobs.map((job) => {
      if (typeof job.id !== 'string' || !job.id || typeof job.message !== 'string'
        || !['queued', 'running', 'saved', 'failed', 'interrupted'].includes(job.status)) throw new Error();
      validateWritingConfig(job.config, userId);
      if (job.draft && (typeof job.draft.title !== 'string' || typeof job.draft.body !== 'string')) throw new Error();
      return job.status === 'running' ? { ...job, status: 'interrupted', message: '프로그램이 종료되어 결과를 확인할 수 없습니다. 네이버 임시저장 목록을 먼저 확인하세요. 자동으로 재실행하지 않습니다.' } : job;
    });
  } catch {
    throw new Error('저장된 작성 목록을 읽지 못했습니다. 기존 목록은 덮어쓰지 않았습니다. 프로그램을 다시 열거나 지원을 요청해 주세요.');
  }
}

export function saveWritingQueue(storage: Pick<Storage, 'setItem'>, userId: string, jobs: readonly WritingJob[]): void {
  if (jobs.length > MAX_WRITING_JOBS) throw new Error(`작성 목록은 최대 ${MAX_WRITING_JOBS}개입니다. 완료 항목을 목록에서 정리해 주세요.`);
  try { storage.setItem(queueKey(userId), JSON.stringify(jobs)); }
  catch { throw new Error('이 PC에 진행 상황을 저장하지 못했습니다. 중복 작성을 막기 위해 작업을 멈춥니다.'); }
}

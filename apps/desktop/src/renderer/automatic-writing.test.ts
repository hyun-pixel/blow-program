import { describe, expect, it, vi } from 'vitest';
import { runAutomaticWriting } from './automatic-writing.js';
import { verifyGeneratedBlogDraft } from '../main/openai-generation.js';
import { defaultPostDecorations } from './post-decoration.js';
import { createRetryJob, readWritingQueue, saveWritingQueue, validateWritingConfig, type WritingJob } from './writing-queue.js';

function fixture() {
  const job: WritingJob = {
    id: 'first', status: 'queued', message: '',
    config: { blogId: 'example', modelName: 'GPT', reasoningLabel: '중간',
      request: { userId: 'test-user', topic: '카페 안내', articleType: '정보형', targetLength: 1800, keywords: [{ value: '카페', repetitions: 3 }], service: '', cta: '', modelId: 'gpt-5.6-terra', reasoningEffort: 'medium' },
      decorations: structuredClone(defaultPostDecorations),
      images: { enabled: false, count: 1, aspectRatio: 'landscape', qualityMode: 'economy', style: '' } },
  };
  const order: string[] = [];
  const ok = (name: string, result: unknown = {}) => vi.fn(async (..._args: unknown[]) => { order.push(name); return { ok: true as const, result }; });
  const naver = {
    prepareAutomaticWriter: vi.fn(async () => { order.push('writer'); return { ok: true, status: { stage: 'WRITER_READY', registeredBlogId: 'example' } }; }),
    enterContent: ok('input'), prepareGeneratedImages: vi.fn(async () => { order.push('prepare-images'); return { ok: true, canceled: false, files: [{ id: 'image1' }] }; }),
    attachImages: ok('attach-images', { insertedCount: 1 }),
    listQuoteStyles: ok('quote-list', { styles: [{ id: 'default' }] }), insertQuote: ok('quote'),
    listDividerStyles: ok('divider-list', { styles: [{ id: 'default' }] }), insertDivider: ok('divider'),
    listStickerCategories: ok('sticker-list', { categories: [{ id: 'pack1', label: '묶음' }] }), insertRandomSticker: ok('sticker'),
    saveDraft: ok('save', { stage: 'DRAFT_SAVE_COMPLETED', currentUrl: 'https://blog.naver.com/example/postwrite' }),
  };
  const ai = {
    generateDraft: vi.fn(async () => { order.push('generate'); return { ok: true, draft: { title: '카페 안내', body: '첫 번째 설명입니다.\n\n다음으로, 두 번째 설명입니다.\n\n마지막으로, 내용을 정리합니다.' }, verification: { valid: true, issues: [] as string[], blockingIssues: [] as string[], warnings: [] as string[] } }; }),
    generateImages: vi.fn(async () => { order.push('images'); return { ok: true, images: [{ dataUrl: 'data:image/png;base64,dGVzdA==' }] }; }),
  };
  const history = { add: ok('history') };
  const bridges = { blowNaver: naver, blowOpenAi: ai, blowWorkHistory: history } as unknown as Pick<Window, 'blowNaver' | 'blowOpenAi' | 'blowWorkHistory'>;
  const controller = new AbortController();
  const updates: WritingJob[] = [];
  const run = (input = job, checkpoint = (value: WritingJob) => { updates.push(value); }) => runAutomaticWriting(input, bridges, controller.signal, checkpoint);
  return { job, order, naver, ai, history, controller, updates, run };
}

describe('automatic writing: one post through confirmed Naver draft', () => {
  it('writes and saves without intermediate confirmation; records history after save', async () => {
    const f = fixture(); await f.run();
    expect(f.order).toEqual(['writer', 'generate', 'input', 'save', 'history']);
    expect(f.updates.at(-1)?.status).toBe('saved');
    expect(f.naver.enterContent.mock.calls[0]?.[0]).toEqual({ title: '카페 안내', paragraphs: ['첫 번째 설명입니다.', '다음으로, 두 번째 설명입니다.', '마지막으로, 내용을 정리합니다.'] });
  });
  it('reuses per-post independent settings for sequential jobs', async () => {
    const f = fixture();
    const second = structuredClone(f.job);
    const config = { ...second.config, request: { ...second.config.request, topic: '두 번째 주제', targetLength: 700 } };
    await f.run(); await f.run({ ...second, id: 'second', config });
    expect(f.order).toEqual(['writer','generate','input','save','history','writer','generate','input','save','history']);
    expect(f.ai.generateDraft).toHaveBeenNthCalledWith(2, config.request);
  });
  it('attaches all images and decorations before saving, using the chosen counts', async () => {
    const f = fixture();
    await f.run({ ...f.job, config: { ...f.job.config, images: { ...f.job.config.images, enabled: true },
      decorations: { quote: { enabled: true, count: 2, style: 'default' }, divider: { enabled: true, count: 1, style: 'random' }, sticker: { enabled: true, count: 1, categoryMode: 'manual', categoryLabel: '묶음' } } } });
    expect(f.order).toEqual(['writer','generate','images','input','prepare-images','attach-images','quote-list','quote','quote','sticker-list','sticker','divider-list','divider','save','history']);
    expect(f.naver.insertRandomSticker.mock.calls[0]?.[2]).toBe('pack1');
    expect(f.naver.attachImages).toHaveBeenCalledWith(['image1'], 'individual', [2]);
  });
  it('reports reduced placement counts when boundaries are scarce', async () => {
    const f = fixture();
    await f.run({ ...f.job, config: { ...f.job.config, decorations: { ...f.job.config.decorations, quote: { enabled: true, count: 10, style: 'random' } } } });
    expect(f.naver.insertQuote).toHaveBeenCalledTimes(3);
    expect(f.updates.at(-1)?.message).toContain('인용구 3회');
  });
  it.each(['LOGIN_REQUIRED','BLOG_MISMATCH'])('does not spend API money after %s', async (stage) => {
    const f = fixture(); f.naver.prepareAutomaticWriter.mockResolvedValue({ ok: true, status: { stage, registeredBlogId: 'example' } });
    await expect(f.run()).rejects.toThrow('네이버 로그인');
    expect(f.ai.generateDraft).not.toHaveBeenCalled();
  });
  it('stops on automatic verification failures before images, input or save', async () => {
    const f = fixture();
    const original = await f.ai.generateDraft();
    f.ai.generateDraft.mockResolvedValue({ ...original, verification: { valid: false, issues: ['제목이 최대 30자를 넘었습니다.'], blockingIssues: [], warnings: [] } });
    await expect(f.run()).rejects.toThrow('최대 30자');
    expect(f.naver.enterContent).not.toHaveBeenCalled();
    expect(f.ai.generateImages).not.toHaveBeenCalled();
    expect(f.updates.at(-1)?.draft?.body).toBeTruthy();
  });
  it('saves length deviations unchanged, runs images and reports the warning without regeneration', async () => {
    const f = fixture();
    const original = f.ai.generateDraft.getMockImplementation()!;
    f.ai.generateDraft.mockImplementation(async () => {
      const response = await original();
      return { ...response, verification: { ...response.verification, warnings: ['본문이 1,546자로 목표 범위를 벗어났습니다.'] } };
    });
    await f.run({ ...f.job, config: { ...f.job.config, images: { ...f.job.config.images, enabled: true } } });
    expect(f.ai.generateDraft).toHaveBeenCalledTimes(1);
    expect(f.ai.generateImages).toHaveBeenCalledTimes(1);
    expect(f.naver.saveDraft).toHaveBeenCalledTimes(1);
    expect(f.updates.at(-1)).toMatchObject({ status: 'saved', warnings: ['본문이 1,546자로 목표 범위를 벗어났습니다.'] });
    expect(f.updates.at(-1)?.message).toContain('작성 결과 안내');
    expect(f.history.add).toHaveBeenCalledTimes(1);
  });
  it('saves keyword mismatches, records counts and continues the next job without extra AI calls', async () => {
    const f = fixture();
    const original = f.ai.generateDraft.getMockImplementation()!;
    f.ai.generateDraft.mockImplementation(async () => {
      const response = await original();
      const draft = { title: '카페 안내', body: '카페 안내입니다.\n\n카페 이용 방법입니다.' };
      const verification = verifyGeneratedBlogDraft(draft, f.job.config.request);
      return { ...response, draft, verification: { ...verification, issues: [...verification.issues], blockingIssues: [...verification.blockingIssues], warnings: [...verification.warnings ?? []] } };
    });
    await f.run();
    await f.run({ ...f.job, id: 'second' });
    expect(f.order).toEqual(['writer','generate','input','save','history','writer','generate','input','save','history']);
    expect(f.ai.generateDraft).toHaveBeenCalledTimes(2);
    expect(f.naver.enterContent).toHaveBeenCalledWith({ title: '카페 안내', paragraphs: ['카페 안내입니다.', '카페 이용 방법입니다.'] });
    const warning = '본문 키워드 ‘카페’: 설정 3회 / 실제 2회.';
    expect(f.updates.at(-1)).toMatchObject({ status: 'saved', warnings: expect.arrayContaining([warning]) });
    expect(f.history.add).toHaveBeenNthCalledWith(1, 'test-user', expect.objectContaining({ jobId: 'first', warnings: expect.arrayContaining([warning]) }));
    expect(f.history.add).toHaveBeenNthCalledWith(2, 'test-user', expect.objectContaining({ jobId: 'second', warnings: expect.arrayContaining([warning]) }));
  });
  it('still stops on Naver input failure even with nonblocking warnings', async () => {
    const f = fixture();
    f.naver.enterContent.mockRejectedValue(new Error('입력 결과를 확인하지 못했습니다.'));
    await expect(f.run()).rejects.toThrow('입력 결과');
    expect(f.naver.saveDraft).not.toHaveBeenCalled();
    expect(f.history.add).not.toHaveBeenCalled();
  });
  it('still rejects an empty body even if verification unexpectedly passes', async () => {
    const f = fixture(), original = f.ai.generateDraft.getMockImplementation()!;
    f.ai.generateDraft.mockImplementation(async () => ({ ...await original(), draft: { title: '안내', body: ' \n\t' } }));
    await expect(f.run()).rejects.toThrow('본문이 비어');
    expect(f.naver.enterContent).not.toHaveBeenCalled();
    expect(f.naver.saveDraft).not.toHaveBeenCalled();
  });
  it('does not save a post missing an image', async () => {
    const f = fixture(); f.ai.generateImages.mockResolvedValue({ ok: true, images: [] });
    await expect(f.run({ ...f.job, config: { ...f.job.config, images: { ...f.job.config.images, enabled: true } } })).rejects.toThrow('장수');
    expect(f.naver.enterContent).not.toHaveBeenCalled();
  });
  it('does not silently replace an unavailable quote style', async () => {
    const f = fixture();
    await expect(f.run({ ...f.job, config: { ...f.job.config, decorations: { ...f.job.config.decorations, quote: { enabled: true, count: 1, style: 'quotation_line' } } } })).rejects.toThrow('디자인');
    expect(f.naver.saveDraft).not.toHaveBeenCalled();
  });
  it('does not silently replace a missing manual sticker pack', async () => {
    const f = fixture();
    await expect(f.run({ ...f.job, config: { ...f.job.config, decorations: { ...f.job.config.decorations, sticker: { enabled: true, count: 1, categoryMode: 'manual', categoryLabel: '없는 묶음' } } } })).rejects.toThrow('스티커 묶음');
    expect(f.naver.saveDraft).not.toHaveBeenCalled();
  });
  it.each(['saved','running','failed','interrupted'] as const)('never reruns a %s post', async (status) => {
    const f = fixture(); await expect(f.run({ ...f.job, status })).rejects.toThrow('대기');
    expect(f.order).toEqual([]);
  });
  it('does not start side effects if checkpoint persistence fails', async () => {
    const f = fixture(); await expect(f.run(f.job, () => { throw new Error('disk full'); })).rejects.toThrow('disk full');
    expect(f.order).toEqual([]);
  });
  it('stops after an in-flight AI request and before Naver input', async () => {
    const f = fixture(); const original = f.ai.generateDraft.getMockImplementation()!;
    f.ai.generateDraft.mockImplementation(async () => { const result = await original(); f.controller.abort(); return result; });
    await expect(f.run()).rejects.toThrow('중단');
    expect(f.naver.enterContent).not.toHaveBeenCalled();
  });
  it('never retries an uncertain save or records it as completed', async () => {
    const f = fixture(); f.naver.saveDraft.mockRejectedValue(new Error('저장 결과 불명'));
    await expect(f.run()).rejects.toThrow('저장 결과 불명');
    expect(f.naver.saveDraft).toHaveBeenCalledTimes(1);
    expect(f.history.add).not.toHaveBeenCalled();
    expect(f.updates.some(({ status }) => status === 'saved')).toBe(false);
  });
  it('preserves a confirmed save if Stop is clicked during save', async () => {
    const f = fixture(); const original = f.naver.saveDraft.getMockImplementation()!;
    f.naver.saveDraft.mockImplementation(async (...args) => { const result = await original(...args); f.controller.abort(); return result; });
    await f.run();
    expect(f.updates.at(-1)?.status).toBe('saved');
    expect(f.history.add).toHaveBeenCalledTimes(1);
  });
  it('keeps saved status when local history fails and does not save twice', async () => {
    const f = fixture(); f.history.add.mockRejectedValue(new Error('disk'));
    await expect(f.run()).rejects.toThrow('작업 내역');
    expect(f.updates.at(-1)?.status).toBe('saved');
    expect(f.naver.saveDraft).toHaveBeenCalledTimes(1);
    expect(f.updates.at(-1)?.historyPending).toBe(true);
    expect(f.updates.at(-1)?.savedUrl).toContain('blog.naver.com');
  });
  it('still records history if the post-save queue checkpoint cannot be persisted', async () => {
    const f = fixture();
    await expect(f.run(f.job, job => { f.updates.push(job); if (job.status === 'saved') throw new Error('queue disk full'); })).rejects.toThrow('진행 상태');
    expect(f.history.add).toHaveBeenCalledTimes(1);
    expect(f.updates.at(-1)).toMatchObject({ status: 'saved', historyPending: false });
  });
  it('never creates a successful history entry when saving is unconfirmed', async () => {
    const f = fixture(); f.naver.saveDraft.mockRejectedValue(new Error('DRAFT_SAVE_UNCONFIRMED'));
    await expect(f.run()).rejects.toThrow('DRAFT_SAVE_UNCONFIRMED');
    expect(f.history.add).not.toHaveBeenCalled();
    expect(f.updates.some(job => job.status === 'saved')).toBe(false);
  });
});

describe('persistent writing queue', () => {
  function storage() {
    const values = new Map<string, string>();
    return { values, getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value); } };
  }
  it('isolates accounts and recovers unfinished work without auto rerunning', () => {
    const s = storage(), { job } = fixture();
    saveWritingQueue(s, 'test-user', [{ ...job, status: 'running' }]);
    expect(readWritingQueue(s, 'another-user')).toEqual([]);
    expect(readWritingQueue(s, 'test-user')[0]?.status).toBe('interrupted');
  });
  it('rejects corrupt or duplicate records without clearing storage', () => {
    const s = storage(), { job } = fixture();
    saveWritingQueue(s, 'test-user', [job, job]);
    const before = [...s.values];
    expect(() => readWritingQueue(s, 'test-user')).toThrow('덮어쓰지');
    expect([...s.values]).toEqual(before);
  });
  it('rejects other account configs, excessive counts and missing manual pack names', () => {
    const { job } = fixture();
    expect(() => validateWritingConfig(job.config, 'other')).toThrow('계정');
    expect(() => validateWritingConfig({ ...job.config, decorations: { ...job.config.decorations, sticker: { enabled: true, count: 11, categoryMode: 'random' } } }, 'test-user')).toThrow('1–10');
    expect(() => validateWritingConfig({ ...job.config, decorations: { ...job.config.decorations, sticker: { enabled: true, count: 1, categoryMode: 'manual' } } }, 'test-user')).toThrow('묶음 이름');
  });
  it('limits the queue and reports storage errors', () => {
    const { job } = fixture(), s = storage();
    expect(() => saveWritingQueue(s, 'test-user', Array(21).fill(job))).toThrow('20');
    expect(() => saveWritingQueue({ setItem() { throw new Error(); } }, 'test-user', [job])).toThrow('멈춥니다');
  });
  it('preserves generated content and length warnings after reloading a saved job', () => {
    const { job } = fixture(), s = storage();
    const saved: WritingJob = { ...job, status: 'saved', draft: { title: '안내', body: '작성된 본문' }, warnings: ['목표 분량보다 짧습니다.'] };
    saveWritingQueue(s, 'test-user', [saved]);
    expect(readWritingQueue(s, 'test-user')).toEqual([saved]);
  });
  it('preserves all 25 keyword reports plus title and length warnings on reload', () => {
    const { job } = fixture(), s = storage();
    const keywords = Array.from({ length: 25 }, (_, index) => ({ value: `키워드${index}`, repetitions: 3 }));
    const draft = { title: '안내', body: '작성된 본문' };
    const config = { ...job.config, request: { ...job.config.request, keywords } };
    const warnings = verifyGeneratedBlogDraft(draft, config.request).warnings ?? [];
    expect(warnings).toHaveLength(27);
    const saved: WritingJob = { ...job, config, status: 'saved', draft, warnings };
    saveWritingQueue(s, 'test-user', [saved]);
    expect(readWritingQueue(s, 'test-user')).toEqual([saved]);
  });
  it.each(['failed', 'interrupted'] as const)('creates an independent retry for %s while preserving the original draft', (status) => {
    const { job } = fixture();
    const failed: WritingJob = { ...job, status, draft: { title: '기존 제목', body: '보존할 본문' }, warnings: ['기존 분량 안내'] };
    const snapshot = structuredClone(failed);
    const retry = createRetryJob(failed, 'test-user');
    expect(retry.id).not.toBe(failed.id);
    expect(retry.config).toEqual(failed.config);
    expect(retry.config).not.toBe(failed.config);
    expect(retry.status).toBe('queued');
    expect(retry.draft).toBeUndefined();
    expect(retry.warnings).toBeUndefined();
    expect(failed).toEqual(snapshot);
  });
  it.each(['queued', 'running', 'saved'] as const)('does not create retries for %s', (status) => {
    const { job } = fixture();
    expect(() => createRetryJob({ ...job, status }, 'test-user')).toThrow();
  });
  it('does not retry another account’s job', () => {
    const { job } = fixture();
    expect(() => createRetryJob({ ...job, status: 'failed' }, 'another-user')).toThrow('계정');
  });
});

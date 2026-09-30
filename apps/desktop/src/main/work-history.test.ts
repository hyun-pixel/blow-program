import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  addWorkHistoryEntry,
  deleteWorkHistoryEntry,
  readWorkHistory,
} from './work-history.js';

const temporaryDirectories: string[] = [];

const validInput = {
  title: '실손보험 가입 전 확인할 점',
  body: '보험 가입 전에 보장 범위와 제외 항목을 확인해 주세요.',
  modelId: 'gpt-5.6-terra',
  modelName: 'GPT-5.6 Terra',
  reasoningEffort: 'medium',
  reasoningLabel: '중간',
  imageCount: 1,
  naverUrl: 'https://blog.naver.com/PostWriteForm.naver',
  settings: {
    articleType: '정보형',
    targetLength: 1_200,
    useGeneratedImages: true,
    imageCount: 1,
    imageAspectRatio: 'landscape',
    imageQualityMode: 'economy',
    imageStyle: '밝고 자연스러운 상담 장면',
  },
} as const;

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((path) => rm(path, { force: true, recursive: true })),
  );
});

async function createHistoryPath(): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), 'blow-work-history-'));
  temporaryDirectories.push(directory);
  return join(directory, 'history.json');
}

describe('work history storage', () => {
  it('retains keyword and length reports after reload alongside legacy entries', async () => {
    const filePath = await createHistoryPath();
    const legacy = await addWorkHistoryEntry(filePath, validInput);
    const warnings = ['본문 키워드 ‘실손보험’: 설정 3회 / 실제 2회.', '본문이 목표 분량보다 짧습니다.'];
    const entry = await addWorkHistoryEntry(filePath, { ...validInput, warnings });
    const entries = await readWorkHistory(filePath);
    expect(entries.find(item => item.id === entry.id)?.warnings).toEqual(warnings);
    expect(entries.find(item => item.id === legacy.id)?.warnings).toBeUndefined();
  });
  it.each(['invalid', [123], Array(33).fill('안내'), ['가'.repeat(1001)]])('rejects invalid report data before storing it', async (warnings) => {
    const filePath = await createHistoryPath();
    await expect(addWorkHistoryEntry(filePath, { ...validInput, warnings })).rejects.toThrow('작성 결과 안내');
    expect(await readWorkHistory(filePath)).toEqual([]);
  });
  it('records a retried job only once and retains its original completion time', async () => {
    const filePath = await createHistoryPath();
    const input = { ...validInput, jobId: 'recovery-job' };
    const original = await addWorkHistoryEntry(filePath, input, new Date('2026-09-28T00:00:00Z'));
    const retried = await addWorkHistoryEntry(filePath, input, new Date('2026-09-29T00:00:00Z'));
    expect(retried).toEqual(original);
    expect(await readWorkHistory(filePath, new Date('2026-09-29T00:00:00Z'))).toEqual([original]);
  });
  it('saves entries newest first without token or cost data', async () => {
    const filePath = await createHistoryPath();
    await addWorkHistoryEntry(filePath, validInput, new Date('2026-09-10T00:00:00.000Z'));
    const newer = await addWorkHistoryEntry(
      filePath,
      { ...validInput, title: '두 번째 글' },
      new Date('2026-09-11T00:00:00.000Z'),
    );

    const entries = await readWorkHistory(filePath, new Date('2026-09-12T00:00:00.000Z'));
    expect(entries.map((entry) => entry.title)).toEqual(['두 번째 글', validInput.title]);
    expect(entries[0]).toEqual(newer);
    const raw = await readFile(filePath, 'utf8');
    expect(raw).not.toContain('token');
    expect(raw).not.toContain('cost');
  });

  it('automatically removes entries older than 30 days', async () => {
    const filePath = await createHistoryPath();
    await addWorkHistoryEntry(filePath, validInput, new Date('2026-07-01T00:00:00.000Z'));
    await addWorkHistoryEntry(
      filePath,
      { ...validInput, title: '최근 글' },
      new Date('2026-08-20T00:00:00.000Z'),
    );

    const entries = await readWorkHistory(filePath, new Date('2026-09-01T00:00:00.000Z'));
    expect(entries).toHaveLength(1);
    expect(entries[0]?.title).toBe('최근 글');
    expect(JSON.parse(await readFile(filePath, 'utf8'))).toHaveLength(1);
  });

  it('deletes one selected entry and rejects unsafe input', async () => {
    const filePath = await createHistoryPath();
    const first = await addWorkHistoryEntry(filePath, validInput);
    await addWorkHistoryEntry(filePath, { ...validInput, title: '남길 글' });

    const entries = await deleteWorkHistoryEntry(filePath, first.id);
    expect(entries).toHaveLength(1);
    expect(entries[0]?.title).toBe('남길 글');
    await expect(deleteWorkHistoryEntry(filePath, '../../other')).rejects.toThrow('삭제할 작업 내역');
    await expect(addWorkHistoryEntry(filePath, { ...validInput, body: '' })).rejects.toThrow('입력값');
  });
});

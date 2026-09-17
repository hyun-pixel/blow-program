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

import { randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

export const WORK_HISTORY_RETENTION_DAYS = 30;

export interface WorkHistorySettings {
  readonly articleType: string;
  readonly targetLength: number;
  readonly useGeneratedImages: boolean;
  readonly imageCount: number;
  readonly imageAspectRatio: 'landscape' | 'portrait' | 'square';
  readonly imageQualityMode: 'economy' | 'quality';
  readonly imageStyle: string;
}

export interface WorkHistoryEntry {
  readonly id: string;
  readonly title: string;
  readonly body: string;
  readonly status: 'draft_saved';
  readonly modelId: string;
  readonly modelName: string;
  readonly reasoningEffort: string;
  readonly reasoningLabel: string;
  readonly finalStage: 'DRAFT_SAVE_COMPLETED';
  readonly imageCount: number;
  readonly naverUrl: string;
  readonly settings: WorkHistorySettings;
  readonly createdAt: string;
}

export interface WorkHistoryInput {
  readonly title: string;
  readonly body: string;
  readonly modelId: string;
  readonly modelName: string;
  readonly reasoningEffort: string;
  readonly reasoningLabel: string;
  readonly imageCount: number;
  readonly naverUrl: string;
  readonly settings: WorkHistorySettings;
}

const retentionMs = WORK_HISTORY_RETENTION_DAYS * 24 * 60 * 60 * 1_000;

function readText(
  input: Record<string, unknown>,
  field: string,
  maximumLength: number,
  required = true,
): string {
  const value = typeof input[field] === 'string' ? input[field].trim() : '';

  if ((required && !value) || value.length > maximumLength) {
    throw new Error('작업 내역의 입력값을 확인해 주세요.');
  }

  return value;
}

function readInteger(
  input: Record<string, unknown>,
  field: string,
  minimum: number,
  maximum: number,
): number {
  const value = input[field];

  if (!Number.isInteger(value) || (value as number) < minimum || (value as number) > maximum) {
    throw new Error('작업 내역의 숫자 값을 확인해 주세요.');
  }

  return value as number;
}

function normalizeNaverUrl(value: unknown): string {
  if (typeof value !== 'string' || !value.trim()) return '';

  try {
    const url = new URL(value.trim());
    const isNaverHost = url.hostname === 'naver.com' || url.hostname.endsWith('.naver.com');
    return (url.protocol === 'https:' && isNaverHost) ? url.toString() : '';
  } catch {
    return '';
  }
}

function normalizeSettings(value: unknown): WorkHistorySettings {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('작업 내역의 설정을 확인해 주세요.');
  }

  const input = value as Record<string, unknown>;
  const imageAspectRatio = input.imageAspectRatio;
  const imageQualityMode = input.imageQualityMode;

  if (!['landscape', 'portrait', 'square'].includes(String(imageAspectRatio))) {
    throw new Error('작업 내역의 이미지 비율을 확인해 주세요.');
  }

  if (!['economy', 'quality'].includes(String(imageQualityMode))) {
    throw new Error('작업 내역의 이미지 품질을 확인해 주세요.');
  }

  return {
    articleType: readText(input, 'articleType', 80),
    targetLength: readInteger(input, 'targetLength', 100, 20_000),
    useGeneratedImages: input.useGeneratedImages === true,
    imageCount: readInteger(input, 'imageCount', 0, 4),
    imageAspectRatio: imageAspectRatio as WorkHistorySettings['imageAspectRatio'],
    imageQualityMode: imageQualityMode as WorkHistorySettings['imageQualityMode'],
    imageStyle: readText(input, 'imageStyle', 500, false),
  };
}

export function normalizeWorkHistoryInput(input: unknown): WorkHistoryInput {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new Error('작업 내역을 확인해 주세요.');
  }

  const candidate = input as Record<string, unknown>;

  return {
    title: readText(candidate, 'title', 200),
    body: readText(candidate, 'body', 30_000),
    modelId: readText(candidate, 'modelId', 200),
    modelName: readText(candidate, 'modelName', 200),
    reasoningEffort: readText(candidate, 'reasoningEffort', 40),
    reasoningLabel: readText(candidate, 'reasoningLabel', 80),
    imageCount: readInteger(candidate, 'imageCount', 0, 50),
    naverUrl: normalizeNaverUrl(candidate.naverUrl),
    settings: normalizeSettings(candidate.settings),
  };
}

function normalizeStoredEntry(input: unknown): WorkHistoryEntry {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new Error('저장된 작업 내역을 확인할 수 없습니다.');
  }

  const candidate = input as Record<string, unknown>;
  const normalized = normalizeWorkHistoryInput(candidate);
  const id = readText(candidate, 'id', 100);
  const createdAt = readText(candidate, 'createdAt', 100);

  if (!/^[0-9a-f-]{36}$/i.test(id) || Number.isNaN(Date.parse(createdAt))) {
    throw new Error('저장된 작업 내역을 확인할 수 없습니다.');
  }

  if (candidate.status !== 'draft_saved' || candidate.finalStage !== 'DRAFT_SAVE_COMPLETED') {
    throw new Error('저장된 작업 상태를 확인할 수 없습니다.');
  }

  return {
    id,
    ...normalized,
    status: 'draft_saved',
    finalStage: 'DRAFT_SAVE_COMPLETED',
    createdAt,
  };
}

async function readStoredEntries(filePath: string): Promise<readonly WorkHistoryEntry[]> {
  try {
    const parsed: unknown = JSON.parse(await readFile(filePath, 'utf8'));

    if (!Array.isArray(parsed)) {
      throw new Error('저장된 작업 내역 형식이 올바르지 않습니다.');
    }

    return parsed.map(normalizeStoredEntry);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return [];
    throw error;
  }
}

async function writeEntries(
  filePath: string,
  entries: readonly WorkHistoryEntry[],
): Promise<void> {
  const temporaryPath = `${filePath}.tmp`;
  await mkdir(dirname(filePath), { recursive: true });

  try {
    await writeFile(temporaryPath, `${JSON.stringify(entries, null, 2)}\n`, {
      encoding: 'utf8',
      mode: 0o600,
    });
    await rename(temporaryPath, filePath);
  } catch (error) {
    await rm(temporaryPath, { force: true });
    throw error;
  }
}

function keepRecentEntries(
  entries: readonly WorkHistoryEntry[],
  now: Date,
): readonly WorkHistoryEntry[] {
  const cutoff = now.getTime() - retentionMs;
  return entries.filter((entry) => Date.parse(entry.createdAt) >= cutoff);
}

export async function readWorkHistory(
  filePath: string,
  now = new Date(),
): Promise<readonly WorkHistoryEntry[]> {
  const stored = await readStoredEntries(filePath);
  const recent = [...keepRecentEntries(stored, now)]
    .sort((left, right) => Date.parse(right.createdAt) - Date.parse(left.createdAt));

  if (recent.length !== stored.length) {
    await writeEntries(filePath, recent);
  }

  return recent;
}

export async function addWorkHistoryEntry(
  filePath: string,
  input: unknown,
  now = new Date(),
): Promise<WorkHistoryEntry> {
  const entry: WorkHistoryEntry = {
    id: randomUUID(),
    ...normalizeWorkHistoryInput(input),
    status: 'draft_saved',
    finalStage: 'DRAFT_SAVE_COMPLETED',
    createdAt: now.toISOString(),
  };
  const entries = keepRecentEntries(await readStoredEntries(filePath), now);
  await writeEntries(filePath, [entry, ...entries]);
  return entry;
}

export async function deleteWorkHistoryEntry(
  filePath: string,
  entryId: unknown,
  now = new Date(),
): Promise<readonly WorkHistoryEntry[]> {
  const id = typeof entryId === 'string' ? entryId.trim() : '';

  if (!/^[0-9a-f-]{36}$/i.test(id)) {
    throw new Error('삭제할 작업 내역을 확인해 주세요.');
  }

  const entries = [...keepRecentEntries(await readStoredEntries(filePath), now)]
    .filter((entry) => entry.id !== id)
    .sort((left, right) => Date.parse(right.createdAt) - Date.parse(left.createdAt));
  await writeEntries(filePath, entries);
  return entries;
}

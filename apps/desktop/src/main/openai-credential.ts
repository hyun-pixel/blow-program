import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

export interface CredentialProtector {
  isEncryptionAvailable(): boolean;
  encryptString(value: string): Buffer;
  decryptString(value: Buffer): string;
}

export interface OpenAiCredentialStatus {
  readonly saved: boolean;
}

export type OpenAiConnectionResult =
  | { readonly ok: true }
  | {
      readonly ok: false;
      readonly code: string;
      readonly message: string;
    };

export type OpenAiModelListResult =
  | {
      readonly ok: true;
      readonly modelIds: readonly string[];
    }
  | {
      readonly ok: false;
      readonly code: string;
      readonly message: string;
    };

function requireEncryption(protector: CredentialProtector): void {
  if (!protector.isEncryptionAvailable()) {
    throw new Error('Windows 보안 저장소를 사용할 수 없습니다.');
  }
}

function normalizeApiKey(input: unknown): string {
  const apiKey = typeof input === 'string' ? input.trim() : '';

  if (apiKey.length < 20 || apiKey.length > 512) {
    throw new Error('OpenAI API 키를 정확히 입력해 주세요.');
  }

  return apiKey;
}

export async function readOpenAiCredentialStatus(
  filePath: string,
  protector: CredentialProtector,
): Promise<OpenAiCredentialStatus> {
  return {
    saved: await readOpenAiCredential(filePath, protector) !== null,
  };
}

export async function readOpenAiCredential(
  filePath: string,
  protector: CredentialProtector,
): Promise<string | null> {
  requireEncryption(protector);

  try {
    return normalizeApiKey(protector.decryptString(await readFile(filePath)));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw error;
  }
}

export async function testOpenAiConnection(
  apiKey: string,
  request: typeof fetch = fetch,
): Promise<OpenAiConnectionResult> {
  const result = await listOpenAiModelIds(apiKey, request);
  return result.ok ? { ok: true } : result;
}

export async function listOpenAiModelIds(
  apiKey: string,
  request: typeof fetch = fetch,
): Promise<OpenAiModelListResult> {
  try {
    const response = await request('https://api.openai.com/v1/models', {
      method: 'GET',
      headers: { Authorization: `Bearer ${normalizeApiKey(apiKey)}` },
      signal: AbortSignal.timeout(15_000),
    });

    if (response.ok) {
      const payload: unknown = await response.json();
      const data = typeof payload === 'object' && payload !== null && 'data' in payload
        ? (payload as { readonly data?: unknown }).data
        : undefined;

      if (!Array.isArray(data)) {
        return {
          ok: false,
          code: 'SERVICE_ERROR',
          message: 'OpenAI 모델 목록을 확인하지 못했습니다. 잠시 후 다시 시도해 주세요.',
        };
      }

      const modelIds = [...new Set(data.flatMap((item) => {
        if (typeof item !== 'object' || item === null || !('id' in item)) return [];
        const id = (item as { readonly id?: unknown }).id;
        return typeof id === 'string' && id.length > 0 && id.length <= 200 ? [id] : [];
      }))].sort();

      return { ok: true, modelIds };
    }

    if (response.status === 401 || response.status === 403) {
      return {
        ok: false,
        code: 'AUTH_FAILED',
        message: 'API 키 또는 모델 조회 권한을 확인해 주세요.',
      };
    }

    if (response.status === 429) {
      return {
        ok: false,
        code: 'RATE_LIMITED',
        message: 'OpenAI 요청 한도를 확인한 뒤 다시 시도해 주세요.',
      };
    }

    return {
      ok: false,
      code: 'SERVICE_ERROR',
      message: 'OpenAI 연결을 확인하지 못했습니다. 잠시 후 다시 시도해 주세요.',
    };
  } catch {
    return {
      ok: false,
      code: 'NETWORK_ERROR',
      message: '인터넷 연결을 확인한 뒤 다시 시도해 주세요.',
    };
  }
}

export async function saveOpenAiCredential(
  filePath: string,
  input: unknown,
  protector: CredentialProtector,
): Promise<OpenAiCredentialStatus> {
  requireEncryption(protector);
  const encrypted = protector.encryptString(normalizeApiKey(input));
  await mkdir(dirname(filePath), { recursive: true });
  await writeFile(filePath, encrypted, { mode: 0o600 });
  return { saved: true };
}

export async function removeOpenAiCredential(
  filePath: string,
  protector: CredentialProtector,
): Promise<OpenAiCredentialStatus> {
  requireEncryption(protector);
  await rm(filePath, { force: true });
  return { saved: false };
}

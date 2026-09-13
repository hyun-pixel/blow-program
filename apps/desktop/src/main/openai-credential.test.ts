import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  readOpenAiCredentialStatus,
  removeOpenAiCredential,
  saveOpenAiCredential,
  testOpenAiConnection,
  type CredentialProtector,
} from './openai-credential.js';

const temporaryDirectories: string[] = [];

const testProtector: CredentialProtector = {
  isEncryptionAvailable: () => true,
  encryptString: (value) => Buffer.from(value).reverse(),
  decryptString: (value) => Buffer.from(value).reverse().toString('utf8'),
};

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((path) => rm(path, { force: true, recursive: true })));
});

describe('OpenAI credential storage', () => {
  it('stores no plaintext and reports save and removal state', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'blow-credential-'));
    temporaryDirectories.push(directory);
    const filePath = join(directory, 'openai-api-key.bin');
    const apiKey = 'sk-test-key-that-must-not-be-plain';

    await expect(readOpenAiCredentialStatus(filePath, testProtector)).resolves.toEqual({ saved: false });
    await expect(saveOpenAiCredential(filePath, apiKey, testProtector)).resolves.toEqual({ saved: true });
    expect((await readFile(filePath)).includes(Buffer.from(apiKey))).toBe(false);
    await expect(readOpenAiCredentialStatus(filePath, testProtector)).resolves.toEqual({ saved: true });
    await expect(removeOpenAiCredential(filePath, testProtector)).resolves.toEqual({ saved: false });
  });

  it('rejects invalid keys and unavailable encryption', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'blow-credential-'));
    temporaryDirectories.push(directory);
    const filePath = join(directory, 'openai-api-key.bin');

    await expect(saveOpenAiCredential(filePath, 'short', testProtector)).rejects.toThrow('정확히 입력');
    await expect(saveOpenAiCredential(filePath, 'sk-test-key-that-is-long-enough', {
      ...testProtector,
      isEncryptionAvailable: () => false,
    })).rejects.toThrow('보안 저장소');
  });
});
describe('OpenAI connection check', () => {
  it('checks the official models endpoint without exposing the key', async () => {
    const apiKey = 'sk-test-key-that-is-long-enough';
    let requestedUrl = '';
    let authorization = '';

    const result = await testOpenAiConnection(
      apiKey,
      async (input, init) => {
        requestedUrl = String(input);
        authorization = new Headers(init?.headers).get('Authorization') ?? '';
        return { ok: true, status: 200 } as Response;
      },
    );

    expect(result).toEqual({ ok: true });
    expect(requestedUrl).toBe('https://api.openai.com/v1/models');
    expect(authorization).toBe(`Bearer ${apiKey}`);
  });

  it('returns a safe message when authentication fails', async () => {
    await expect(
      testOpenAiConnection(
        'sk-test-key-that-is-long-enough',
        async () => ({ ok: false, status: 401 }) as Response,
      ),
    ).resolves.toEqual({
      ok: false,
      code: 'AUTH_FAILED',
      message: 'API 키 또는 모델 조회 권한을 확인해 주세요.',
    });
  });
});

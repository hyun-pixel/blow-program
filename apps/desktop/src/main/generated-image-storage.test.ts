import { access, mkdir, mkdtemp, rm, utimes, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  completePendingGeneratedImages,
  discardPendingGeneratedImages,
  pruneGeneratedImages,
} from './generated-image-storage.js';

describe('생성 이미지 보관 기간', () => {
  it('BLOW 생성 폴더의 7일 지난 JPG만 삭제한다', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'blow-generated-images-'));
    const now = new Date('2026-09-17T00:00:00.000Z');
    const oldImage = join(directory, 'old.jpg');
    const recentImage = join(directory, 'recent.jpg');
    const unrelatedFile = join(directory, 'keep.txt');

    try {
      await Promise.all([
        writeFile(oldImage, 'old'),
        writeFile(recentImage, 'recent'),
        writeFile(unrelatedFile, 'keep'),
      ]);
      await utimes(oldImage, new Date('2026-09-08T00:00:00.000Z'), new Date('2026-09-08T00:00:00.000Z'));
      await utimes(recentImage, new Date('2026-09-12T00:00:00.000Z'), new Date('2026-09-12T00:00:00.000Z'));
      await utimes(unrelatedFile, new Date('2026-09-08T00:00:00.000Z'), new Date('2026-09-08T00:00:00.000Z'));

      await expect(pruneGeneratedImages(directory, now)).resolves.toBe(1);
      await expect(access(oldImage)).rejects.toMatchObject({ code: 'ENOENT' });
      await expect(access(recentImage)).resolves.toBeUndefined();
      await expect(access(unrelatedFile)).resolves.toBeUndefined();
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it('완료 이미지는 보관하고 비정상 종료로 남은 임시 이미지는 정리한다', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'blow-pending-images-'));
    const pendingDirectory = join(directory, 'Pending');
    const completedImage = join(directory, 'completed.jpg');
    const abandonedImage = join(pendingDirectory, 'abandoned.jpg');
    const unrelatedFile = join(pendingDirectory, 'keep.txt');

    try {
      await mkdir(pendingDirectory, { recursive: true });
      await Promise.all([
        writeFile(join(pendingDirectory, 'completed.jpg'), 'completed'),
        writeFile(unrelatedFile, 'keep'),
      ]);

      await expect(
        completePendingGeneratedImages(pendingDirectory, directory),
      ).resolves.toBe(1);
      await expect(access(completedImage)).resolves.toBeUndefined();
      await writeFile(abandonedImage, 'abandoned');
      await expect(discardPendingGeneratedImages(pendingDirectory)).resolves.toBe(1);
      await expect(access(abandonedImage)).rejects.toMatchObject({ code: 'ENOENT' });
      await expect(access(unrelatedFile)).resolves.toBeUndefined();
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
});

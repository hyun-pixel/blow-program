import { mkdir, readdir, rename, stat, unlink } from 'node:fs/promises';
import { extname, join } from 'node:path';

export const GENERATED_IMAGE_RETENTION_DAYS = 7;

function isMissingFile(error: unknown): boolean {
  return error instanceof Error
    && 'code' in error
    && error.code === 'ENOENT';
}

async function readGeneratedImageNames(directory: string): Promise<string[]> {
  try {
    return (await readdir(directory, { withFileTypes: true }))
      .filter((entry) => (
        entry.isFile() && extname(entry.name).toLowerCase() === '.jpg'
      ))
      .map((entry) => entry.name);
  } catch (error) {
    if (isMissingFile(error)) return [];
    throw error;
  }
}

export async function discardPendingGeneratedImages(
  directory: string,
): Promise<number> {
  const names = await readGeneratedImageNames(directory);

  await Promise.all(names.map((name) => unlink(join(directory, name))));
  return names.length;
}

export async function completePendingGeneratedImages(
  pendingDirectory: string,
  completedDirectory: string,
): Promise<number> {
  const names = await readGeneratedImageNames(pendingDirectory);

  if (names.length === 0) return 0;

  await mkdir(completedDirectory, { recursive: true });
  await Promise.all(names.map((name) => rename(
    join(pendingDirectory, name),
    join(completedDirectory, name),
  )));
  return names.length;
}

export async function pruneGeneratedImages(
  directory: string,
  now = new Date(),
): Promise<number> {
  let entries;

  try {
    entries = await readdir(directory, { withFileTypes: true });
  } catch (error) {
    if (isMissingFile(error)) return 0;
    throw error;
  }

  const cutoff = now.getTime()
    - GENERATED_IMAGE_RETENTION_DAYS * 24 * 60 * 60 * 1_000;
  let deleted = 0;

  for (const entry of entries) {
    if (!entry.isFile() || extname(entry.name).toLowerCase() !== '.jpg') continue;

    const path = join(directory, entry.name);

    try {
      if ((await stat(path)).mtimeMs >= cutoff) continue;
      await unlink(path);
      deleted += 1;
    } catch (error) {
      if (!isMissingFile(error)) throw error;
    }
  }

  return deleted;
}

import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  normalizeBrandProfileUserId,
  readBrandProfile,
  saveBrandProfile,
} from './brand-profile.js';

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((path) => rm(path, { force: true, recursive: true })),
  );
});

describe('brand profile storage', () => {
  it('returns null before a profile is saved', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'blow-brand-profile-'));
    temporaryDirectories.push(directory);

    await expect(readBrandProfile(join(directory, 'profile.json'))).resolves.toBeNull();
  });

  it('trims, saves and reads a complete profile', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'blow-brand-profile-'));
    temporaryDirectories.push(directory);
    const filePath = join(directory, 'profile.json');

    const saved = await saveBrandProfile(filePath, {
      brandName: ' BLOW ',
      industry: ' 콘텐츠 마케팅 ',
      brandIntroduction: ' 네이버 블로그 글 작성을 돕는 서비스 ',
      productsAndServices: ' 블로그 초안 생성 ',
      contentDirection: ' 정보성 글 중심 ',
      activityRegion: ' 전국 ',
      defaultCta: ' 상담을 신청해 주세요. ',
      defaultTone: ' 쉽고 친절하게 ',
    });

    expect(saved).toMatchObject({
      brandName: 'BLOW',
      industry: '콘텐츠 마케팅',
      brandIntroduction: '네이버 블로그 글 작성을 돕는 서비스',
      productsAndServices: '블로그 초안 생성',
      contentDirection: '정보성 글 중심',
      activityRegion: '전국',
      defaultCta: '상담을 신청해 주세요.',
      defaultTone: '쉽고 친절하게',
    });
    expect(Number.isNaN(Date.parse(saved.updatedAt))).toBe(false);
    await expect(readBrandProfile(filePath)).resolves.toEqual(saved);

    const updated = await saveBrandProfile(filePath, {
      ...saved,
      defaultTone: '간결한 존댓말',
    });
    await expect(readBrandProfile(filePath)).resolves.toEqual(updated);
  });
  it('keeps a previously saved core service as the brand introduction', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'blow-brand-profile-'));
    temporaryDirectories.push(directory);
    const filePath = join(directory, 'profile.json');

    const saved = await saveBrandProfile(filePath, {
      brandName: 'BLOW',
      industry: '콘텐츠 마케팅',
      coreService: '네이버 블로그 글 작성',
    });

    expect(saved).toMatchObject({
      brandIntroduction: '네이버 블로그 글 작성',
      productsAndServices: '',
      contentDirection: '',
    });
  });

  it('rejects missing required fields and unsafe user ids', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'blow-brand-profile-'));
    temporaryDirectories.push(directory);

    await expect(
      saveBrandProfile(join(directory, 'profile.json'), {
        brandName: 'BLOW',
        industry: '',
        brandIntroduction: '',
        activityRegion: '',
        defaultCta: '',
        defaultTone: '',
      }),
    ).rejects.toThrow('브랜드명, 업종');
    expect(() => normalizeBrandProfileUserId('../../other-user')).toThrow(
      '로그인 계정',
    );
  });
});

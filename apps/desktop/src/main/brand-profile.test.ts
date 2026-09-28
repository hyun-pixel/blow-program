import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  normalizeBrandProfileUserId,
  readBrandProfile,
  saveBrandProfile,
  saveBrandProfileProducts,
} from './brand-profile.js';

const temporaryDirectories: string[] = [];
const completeProfile = {
  brandName: 'BLOW',
  industry: '콘텐츠 마케팅',
  brandIntroduction: '네이버 블로그 글 작성',
  defaultTone: '친절한 존댓말',
  productsAndServices: '블로그 초안 생성',
  businessHours: '평일 10:00–18:00',
  coreStrengths: '순서대로 작성하는 화면',
  targetCustomers: '블로그를 운영하는 사업자',
  mustEmphasize: '사용자가 내용을 검토한 후 저장',
  phoneNumber: '테스트용 공개 연락처',
  address: '온라인 전용',
};

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
      ...completeProfile,
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

    const legacy = {
      brandName: 'BLOW',
      industry: '콘텐츠 마케팅',
      coreService: '네이버 블로그 글 작성',
      updatedAt: '2026-09-01T00:00:00Z',
    };
    await writeFile(filePath, JSON.stringify(legacy), 'utf8');
    const saved = await readBrandProfile(filePath);

    expect(saved).toMatchObject({
      brandIntroduction: '네이버 블로그 글 작성',
      productsAndServices: '',
      contentDirection: '',
    });
    await expect(saveBrandProfile(filePath, saved)).rejects.toThrow('기본 말투');
    await expect(readBrandProfile(filePath)).resolves.toEqual(saved);
  });

  it.each(Object.keys(completeProfile).filter((field) => field !== 'productsAndServices') as (keyof typeof completeProfile)[])(
    'rejects a blank %s without replacing the previously saved profile',
    async (field) => {
      const directory = await mkdtemp(join(tmpdir(), 'blow-brand-profile-'));
      temporaryDirectories.push(directory);
      const filePath = join(directory, 'profile.json');
      const saved = await saveBrandProfile(filePath, completeProfile);
      await expect(saveBrandProfile(filePath, { ...completeProfile, [field]: '   ' })).rejects.toThrow();
      await expect(readBrandProfile(filePath)).resolves.toEqual(saved);
    },
  );

  it('allows the main settings to be saved before configuring the separate product list', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'blow-brand-profile-'));
    temporaryDirectories.push(directory);
    const saved = await saveBrandProfile(join(directory, 'profile.json'), {
      ...completeProfile, productsAndServices: '',
    });
    expect(saved.productsAndServices).toBe('');
  });

  it('saves only products while preserving current and retired profile values', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'blow-brand-profile-'));
    temporaryDirectories.push(directory);
    const filePath = join(directory, 'profile.json');
    const original = await saveBrandProfile(filePath, {
      ...completeProfile, priceInfo: '보관할 가격', consultationLink: 'https://example.invalid/old',
      accentColor: '보관할 색상', imageStyle: '보관할 스타일',
    });
    const saved = await saveBrandProfileProducts(filePath, [' 상품 A ', '서비스 B']);
    const { updatedAt: _oldDate, productsAndServices: _oldProducts, ...previous } = original;
    const { updatedAt: _newDate, productsAndServices, productPrices, ...current } = saved;
    expect(current).toEqual(previous);
    expect(productPrices).toEqual({});
    expect(productsAndServices).toBe('상품 A\n서비스 B');
    await expect(readBrandProfile(filePath)).resolves.toEqual(saved);
    await expect(saveBrandProfileProducts(filePath, ['상품 A', '상품 A'])).rejects.toThrow('중복');
    await expect(saveBrandProfileProducts(filePath, [''])).rejects.toThrow('빈 항목');
    await expect(readBrandProfile(filePath)).resolves.toEqual(saved);
  });

  it('does not create a partial profile before the initial settings have been saved', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'blow-brand-profile-'));
    temporaryDirectories.push(directory);
    const filePath = join(directory, 'profile.json');
    await expect(saveBrandProfileProducts(filePath, ['상품 A'])).rejects.toThrow('먼저');
    await expect(readBrandProfile(filePath)).resolves.toBeNull();
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

describe('product price persistence', () => {
  it('keeps prices through reload and a main settings save, and clears a removed price', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'blow-product-prices-'));
    temporaryDirectories.push(directory);
    const filePath = join(directory, 'profile.json');
    await saveBrandProfile(filePath, completeProfile);
    let saved = await saveBrandProfileProducts(filePath, [
      { name: '상품 A', price: ' 30,000원 ' }, { name: '서비스 B', price: '' },
    ]);
    expect(saved.productPrices).toEqual({ '상품 A': '30,000원' });
    await expect(readBrandProfile(filePath)).resolves.toEqual(saved);
    saved = await saveBrandProfile(filePath, { ...saved, defaultTone: '간결하게' });
    expect(saved.productPrices).toEqual({ '상품 A': '30,000원' });
    await expect(saveBrandProfileProducts(filePath, [{name:'상품 A',price:123}])).rejects.toThrow('가격');
    await expect(readBrandProfile(filePath)).resolves.toEqual(saved);
    saved = await saveBrandProfileProducts(filePath, [{ name: '상품 A', price: '' }]);
    expect(saved.productPrices).toEqual({});
    expect(saved.defaultTone).toBe('간결하게');
    await expect(readBrandProfile(filePath)).resolves.toEqual(saved);
  });
});

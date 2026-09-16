import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

export interface BrandProfileInput {
  readonly brandName: string;
  readonly industry: string;
  readonly brandIntroduction: string;
  readonly productsAndServices: string;
  readonly contentDirection: string;
  readonly activityRegion: string;
  readonly priceInfo: string;
  readonly businessHours: string;
  readonly coreStrengths: string;
  readonly targetCustomers: string;
  readonly mustEmphasize: string;
  readonly prohibitedPhrases: string;
  readonly requiredPhrases: string;
  readonly defaultCta: string;
  readonly defaultTone: string;
  readonly accentColor: string;
  readonly imageStyle: string;
  readonly phoneNumber: string;
  readonly address: string;
  readonly consultationLink: string;
}

export interface BrandProfile extends BrandProfileInput {
  readonly updatedAt: string;
}

const fieldLimits = {
  brandName: 80,
  industry: 80,
  brandIntroduction: 1_000,
  productsAndServices: 1_500,
  contentDirection: 1_000,
  // Accepted only to migrate profiles saved before the field split.
  coreService: 500,
  activityRegion: 120,
  priceInfo: 300,
  businessHours: 300,
  coreStrengths: 1_000,
  targetCustomers: 500,
  mustEmphasize: 1_000,
  prohibitedPhrases: 500,
  requiredPhrases: 500,
  defaultCta: 300,
  defaultTone: 300,
  accentColor: 100,
  imageStyle: 500,
  phoneNumber: 80,
  address: 300,
  consultationLink: 2_048,
} as const;
function readText(
  input: Record<string, unknown>,
  field: keyof typeof fieldLimits,
): string {
  const value = typeof input[field] === 'string' ? input[field].trim() : '';

  if (value.length > fieldLimits[field]) {
    throw new Error('브랜드 정보의 입력 길이를 확인해 주세요.');
  }

  return value;
}

function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

export function normalizeBrandProfile(input: unknown): BrandProfileInput {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new Error('브랜드 정보를 확인해 주세요.');
  }

  const candidate = input as Record<string, unknown>;
  const brandIntroduction = readText(candidate, 'brandIntroduction')
    || readText(candidate, 'coreService');
  const profile = {
    brandName: readText(candidate, 'brandName'),
    industry: readText(candidate, 'industry'),
    brandIntroduction,
    productsAndServices: readText(candidate, 'productsAndServices'),
    contentDirection: readText(candidate, 'contentDirection'),
    activityRegion: readText(candidate, 'activityRegion'),
    priceInfo: readText(candidate, 'priceInfo'),
    businessHours: readText(candidate, 'businessHours'),
    coreStrengths: readText(candidate, 'coreStrengths'),
    targetCustomers: readText(candidate, 'targetCustomers'),
    mustEmphasize: readText(candidate, 'mustEmphasize'),
    prohibitedPhrases: readText(candidate, 'prohibitedPhrases'),
    requiredPhrases: readText(candidate, 'requiredPhrases'),
    defaultCta: readText(candidate, 'defaultCta'),
    defaultTone: readText(candidate, 'defaultTone'),
    accentColor: readText(candidate, 'accentColor'),
    imageStyle: readText(candidate, 'imageStyle'),
    phoneNumber: readText(candidate, 'phoneNumber'),
    address: readText(candidate, 'address'),
    consultationLink: readText(candidate, 'consultationLink'),
  };

  if (!profile.brandName || !profile.industry || !profile.brandIntroduction) {
    throw new Error('브랜드명, 업종, 브랜드·사업 소개를 입력해 주세요.');
  }

  if (profile.consultationLink && !isHttpUrl(profile.consultationLink)) {
    throw new Error('예약·상담 링크 형식을 확인해 주세요.');
  }

  return profile;
}

export function normalizeBrandProfileUserId(input: unknown): string {
  const userId = typeof input === 'string' ? input.trim().toLowerCase() : '';

  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(userId)) {
    throw new Error('로그인 계정 정보를 확인해 주세요.');
  }

  return userId;
}

export async function readBrandProfile(filePath: string): Promise<BrandProfile | null> {
  try {
    const parsed = JSON.parse(await readFile(filePath, 'utf8')) as Record<string, unknown>;
    const profile = normalizeBrandProfile(parsed);
    const updatedAt = typeof parsed.updatedAt === 'string' ? parsed.updatedAt : '';

    if (Number.isNaN(Date.parse(updatedAt))) {
      throw new Error('저장된 브랜드 정보의 날짜를 확인할 수 없습니다.');
    }

    return { ...profile, updatedAt };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw error;
  }
}

export async function saveBrandProfile(
  filePath: string,
  input: unknown,
): Promise<BrandProfile> {
  const profile: BrandProfile = {
    ...normalizeBrandProfile(input),
    updatedAt: new Date().toISOString(),
  };
  const temporaryPath = `${filePath}.tmp`;

  await mkdir(dirname(filePath), { recursive: true });

  try {
    await writeFile(temporaryPath, `${JSON.stringify(profile, null, 2)}\n`, {
      encoding: 'utf8',
      mode: 0o600,
    });
    await rename(temporaryPath, filePath);
  } catch (error) {
    await rm(temporaryPath, { force: true });
    throw error;
  }

  return profile;
}

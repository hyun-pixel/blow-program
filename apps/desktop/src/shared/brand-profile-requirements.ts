// Keep new-save requirements separate from legacy profile loading.
export const requiredBrandProfileLabels = {
  brandName: '브랜드명',
  industry: '업종',
  brandIntroduction: '브랜드·사업 소개',
  defaultTone: '기본 말투',
  businessHours: '영업시간',
  coreStrengths: '핵심 강점과 차별점',
  targetCustomers: '주요 고객',
  mustEmphasize: '반드시 강조할 내용',
  phoneNumber: '전화번호',
  address: '주소',
} as const;

export const requiredBrandProfileFields =
  Object.keys(requiredBrandProfileLabels) as (keyof typeof requiredBrandProfileLabels)[];

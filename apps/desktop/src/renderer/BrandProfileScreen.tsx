import {
  ArrowUpRight,
  Building2,
  CheckCircle2,
  Circle,
  HardDrive,
  KeyRound,
  Link2,
  LoaderCircle,
  Save,
  ShieldCheck,
  XCircle,
} from 'lucide-react';
import { type FormEvent, useEffect, useState } from 'react';
import { requiredBrandProfileFields, requiredBrandProfileLabels } from '../shared/brand-profile-requirements.js';

import type { ProductPrices } from '../shared/product-services.js';

import { BrandProductsEditor } from './BrandProductsEditor.js';

interface ProfileForm {
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

type RequiredField = (typeof requiredBrandProfileFields)[number];
type FieldWithError = RequiredField;
type FieldErrors = Partial<Record<FieldWithError, string>>;

const emptyProfile: ProfileForm = {
  brandName: '',
  industry: '',
  brandIntroduction: '',
  productsAndServices: '',
  contentDirection: '',
  activityRegion: '',
  defaultCta: '',
  defaultTone: '',
  priceInfo: '',
  businessHours: '',
  coreStrengths: '',
  targetCustomers: '',
  mustEmphasize: '',
  prohibitedPhrases: '',
  requiredPhrases: '',
  accentColor: '',
  imageStyle: '',
  phoneNumber: '',
  address: '',
  consultationLink: '',
};

const requiredFieldMessages = Object.fromEntries(
  requiredBrandProfileFields.map((field) => [field, `${requiredBrandProfileLabels[field]} 항목을 입력해 주세요.`]),
) as Record<RequiredField, string>;

function formatSavedAt(value: string): string {
  return new Intl.DateTimeFormat('ko-KR', {
    dateStyle: 'long',
    timeStyle: 'short',
  }).format(new Date(value));
}

type ProfileFieldKey = keyof ProfileForm;

interface ProfileFieldDefinition {
  readonly key: ProfileFieldKey;
  readonly label: string;
  readonly placeholder: string;
  readonly maxLength: number;
  readonly multiline?: boolean;
  readonly wide?: boolean;
  readonly inputType?: 'text' | 'tel' | 'url';
  readonly autoComplete?: string;
  readonly help?: string;
}

interface OptionalSection {
  readonly title: string;
  readonly description: string;
  readonly fields: readonly ProfileFieldDefinition[];
}

const additionalRequiredFields: readonly ProfileFieldDefinition[] = [
  {
    key: 'defaultTone',
    label: '기본 말투',
    placeholder: '예: 쉽고 친절한 존댓말',
    maxLength: 300,
    autoComplete: 'off',
  },
  {
    key: 'businessHours',
    label: '영업시간',
    placeholder: '예: 평일 10:00–19:00, 일요일 휴무',
    maxLength: 300,
    multiline: true,
  },
  {
    key: 'coreStrengths',
    label: '핵심 강점과 차별점',
    placeholder: '예: 예약제 운영, 10년 경력 담당자 상담',
    maxLength: 1_000,
    multiline: true,
    wide: true,
    help: '확인할 수 있는 사실만 입력하고 과장된 최상급 표현은 피하세요.',
  },
  {
    key: 'targetCustomers',
    label: '주요 고객',
    placeholder: '예: 첫 본식을 준비하며 자연스러운 스타일을 원하는 예비 신부',
    maxLength: 500,
    multiline: true,
    wide: true,
  },
  {
    key: 'mustEmphasize',
    label: '반드시 강조할 내용',
    placeholder: '예: 모든 상담은 예약제로 운영',
    maxLength: 1_000,
    multiline: true,
    wide: true,
  },
  {
    key: 'phoneNumber',
    label: '전화번호',
    placeholder: '예: 02-1234-5678',
    maxLength: 80,
    inputType: 'tel',
    autoComplete: 'tel',
    help: '고객이 연락할 수 있는 브랜드의 공개 전화번호를 입력해 주세요.',
  },
  {
    key: 'address',
    label: '주소',
    placeholder: '예: 서울특별시 강남구…',
    maxLength: 300,
    multiline: true,
    autoComplete: 'street-address',
    help: '공개 가능한 사업장 주소를 입력해 주세요. 방문 장소가 없다면 온라인 전용 등 실제 운영 형태를 적어 주세요.',
  },
];

const optionalSections: readonly OptionalSection[] = [
  {
    title: '글에 적용할 표현 기준',
    description: '콘텐츠 방향과 글에 적용할 문구',
    fields: [
      {
        key: 'contentDirection',
        label: '블로그 콘텐츠 방향',
        placeholder: '예: 전문용어를 쉽게 설명하고 정보성 내용을 중심으로 작성',
        maxLength: 1_000,
        multiline: true,
        wide: true,
        help: '모든 글에 공통으로 적용할 운영 방향만 적어 주세요.',
      },
      {
        key: 'prohibitedPhrases',
        label: '사용 금지 표현',
        placeholder: '예: 무조건, 업계 1위, 100% 보장',
        maxLength: 500,
        multiline: true,
        wide: true,
        help: '쉼표 또는 줄바꿈으로 여러 표현을 구분할 수 있습니다.',
      },
      {
        key: 'requiredPhrases',
        label: '필수 포함 문구',
        placeholder: '예: 결과는 개인에 따라 다를 수 있습니다.',
        maxLength: 500,
        multiline: true,
        wide: true,
      },
    ],
  },
];

const optionalFieldKeys: readonly ProfileFieldKey[] = [
  'activityRegion',
  'defaultCta',
  ...optionalSections.flatMap((section) => section.fields.map((field) => field.key)),
];

function ProfileField({
  field,
  value,
  disabled,
  required = false,
  errorMessage,
  onChange,
  onBlur,
}: {
  readonly field: ProfileFieldDefinition;
  readonly value: string;
  readonly disabled: boolean;
  readonly required?: boolean;
  readonly errorMessage?: string | undefined;
  readonly onChange: (field: ProfileFieldKey, value: string) => void;
  readonly onBlur?: (field: ProfileFieldKey) => void;
}) {
  const inputId = `brand-${field.key}`;
  const helpId = field.help ? `${inputId}-help` : undefined;
  const errorId = errorMessage ? `${inputId}-error` : undefined;
  const describedBy = [helpId, errorId].filter(Boolean).join(' ') || undefined;

  return (
    <div className={`field-group ${field.wide ? 'is-wide' : ''}`}>
      <label htmlFor={inputId}>
        {field.label}
        <span>{required ? '필수' : '선택'}</span>
      </label>
      {field.multiline ? (
        <textarea
          id={inputId}
          form="brand-profile-form"
          className="brand-textarea"
          value={value}
          maxLength={field.maxLength}
          disabled={disabled}
          required={required}
          onBlur={() => onBlur?.(field.key)}
          autoComplete={field.autoComplete}
          aria-invalid={Boolean(errorMessage)}
          aria-describedby={describedBy}
          placeholder={field.placeholder}
          onChange={(event) => onChange(field.key, event.target.value)}
        />
      ) : (
        <input
          id={inputId}
          form="brand-profile-form"
          type={field.inputType ?? 'text'}
          value={value}
          maxLength={field.maxLength}
          disabled={disabled}
          required={required}
          onBlur={() => onBlur?.(field.key)}
          autoComplete={field.autoComplete}
          aria-invalid={Boolean(errorMessage)}
          aria-describedby={describedBy}
          placeholder={field.placeholder}
          onChange={(event) => onChange(field.key, event.target.value)}
        />
      )}
      {field.help ? (
        <p id={helpId} className="field-help">
          {field.help}
        </p>
      ) : null}
      {errorMessage ? (
        <p id={errorId} className="field-error">
          {errorMessage}
        </p>
      ) : null}
    </div>
  );
}

export function BrandProfileScreen({ userId, onContinue, onBusyChange }: {
  readonly userId: string;
  readonly onContinue?: () => void;
  readonly onBusyChange?: (busy: boolean) => void;
}) {
  const [form, setForm] = useState<ProfileForm>(emptyProfile);
  const [productPrices, setProductPrices] = useState<ProductPrices>({});
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isProductsSaving, setIsProductsSaving] = useState(false);
  const [isDirty, setIsDirty] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    onBusyChange?.(isSaving || isProductsSaving);
    return () => onBusyChange?.(false);
  }, [isSaving, isProductsSaving, onBusyChange]);

  useEffect(() => {
    let active = true;

    void window.blowBrandProfile.get(userId).then((response) => {
      if (!active) return;

      if (response.ok) {
        if (response.profile) {
          const {
            updatedAt,
            productPrices: savedPrices = {},
            ...savedProfile
          } = response.profile;
          setForm(savedProfile);
          setProductPrices(savedPrices);
          setSavedAt(updatedAt);
        }
      } else {
        setErrorMessage(response.error.message);
      }

      setIsLoading(false);
    });

    return () => {
      active = false;
    };
  }, [userId]);

  const updateField = (field: keyof ProfileForm, value: string): void => {
    setForm((current) => ({ ...current, [field]: value }));
    setIsDirty(true);
    setNotice(null);

    if (
      (
        (field in requiredBrandProfileLabels)
        && value.trim()
      )
    ) {
      setFieldErrors((current) => ({ ...current, [field]: undefined }));
    }
  };

  const validateField = (field: ProfileFieldKey): void => {
    if (!(field in requiredBrandProfileLabels)) return;
    setFieldErrors((current) => ({
      ...current,
      [field]: form[field].trim()
        ? undefined
        : requiredFieldMessages[field as RequiredField],
    }));
  };

  const saveProfile = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    if (isSaving || isProductsSaving) return;
    const nextErrors = requiredBrandProfileFields
      .reduce<FieldErrors>((errors, field) => {
        if (!form[field].trim()) {
          errors[field] = requiredFieldMessages[field];
        }
        return errors;
      }, {});


    if (Object.keys(nextErrors).length > 0) {
      setFieldErrors(nextErrors);
      setErrorMessage('입력 내용을 확인한 뒤 다시 저장해 주세요.');
      const firstInvalidField = Object.keys(nextErrors)[0] as FieldWithError;
      document.getElementById(`brand-${firstInvalidField}`)?.focus();
      return;
    }

    setIsSaving(true);
    setNotice(null);
    setErrorMessage(null);
    try {
      const response = await window.blowBrandProfile.save(userId, { ...form, productPrices });

      if (response.ok && response.profile) {
        const {
          updatedAt,
          productPrices: savedPrices = {},
          ...savedProfile
        } = response.profile;
        setForm(savedProfile);
        setProductPrices(savedPrices);
        setSavedAt(updatedAt);
        setIsDirty(false);
        setFieldErrors({});
        setNotice('다음 글부터 저장한 브랜드 정보를 기본값으로 사용합니다.');
      } else {
        setErrorMessage(
          response.ok
            ? '브랜드 정보를 저장하지 못했습니다.'
            : response.error.message,
        );
      }
    } catch {
      setErrorMessage('저장하지 못했습니다. 입력 내용은 유지됩니다. 잠시 후 다시 시도해 주세요.');
    } finally {
      setIsSaving(false);
    }
  };

  const requiredFieldCount = requiredBrandProfileFields.filter((field) => form[field].trim()).length;
  const hasRequiredFields = requiredFieldCount === requiredBrandProfileFields.length;
  const optionalFieldCount = optionalFieldKeys
    .filter((field) => form[field].trim()).length;
  const statusLabel = isLoading
    ? '불러오는 중'
    : isDirty
      ? '저장 필요'
      : savedAt
        ? '저장됨'
        : '작성 전';

  return (
    <>
      <header className="page-head brand-page-head">
        <div>
          <h1>블로그 세팅</h1>
          <p>
            브랜드 정보를 저장하고 AI와 네이버를 연결하세요. 준비가 끝나면 새 글을 작성할 수 있습니다.
          </p>
        </div>
        <span className="workspace-paper" aria-hidden="true"><span /></span>
      </header>

      <nav className="setup-shortcuts" aria-label="블로그 세팅 바로가기">
        <a href="#brand-profile-heading">
          <Building2 aria-hidden="true" />
          <span><strong>브랜드 정보</strong><small>글에 반영할 기본 정보</small></span>
          <ArrowUpRight aria-hidden="true" />
        </a>
        <a href="#brand-ai-heading">
          <KeyRound aria-hidden="true" />
          <span><strong>AI 연결</strong><small>OpenAI API 키 설정</small></span>
          <ArrowUpRight aria-hidden="true" />
        </a>
        <a href="#brand-naver-heading">
          <Link2 aria-hidden="true" />
          <span><strong>네이버 연결</strong><small>글을 저장할 블로그</small></span>
          <ArrowUpRight aria-hidden="true" />
        </a>
      </nav>

      {errorMessage ? (
        <div className="message error-message" role="alert">
          <XCircle aria-hidden="true" />
          <div>
            <h2>블로그 세팅을 완료하지 못했습니다</h2>
            <p>{errorMessage}</p>
          </div>
        </div>
      ) : null}

      {notice ? (
        <div className="message success-message" role="status">
          <CheckCircle2 aria-hidden="true" />
          <div>
            <h2>블로그 세팅 저장 완료</h2>
            <p>{notice}</p>
            {onContinue && savedAt && !isDirty ? (
              <button className="button secondary setup-next-button" type="button" onClick={onContinue}>
                다음: AI 연결
              </button>
            ) : null}
          </div>
        </div>
      ) : null}

      <section
        className="connection-workbench brand-profile-workbench"
        aria-labelledby="brand-profile-heading"
        aria-busy={isLoading || isSaving || isProductsSaving}
      >
        <div className="connection-form-panel">
          <header className="panel-heading brand-category-heading">
            <div>
              <h2 id="brand-profile-heading">필수 사항</h2>
              <p>아래 10개 항목을 모두 입력해 주세요. 상품·서비스 목록은 아래 별도 영역에서 저장합니다.</p>
            </div>
          </header>

          <div className="connection-form brand-profile-form">
            <form
              id="brand-profile-form"
              className="brand-required-fields"
              noValidate
              onSubmit={(event) => void saveProfile(event)}
            >
              <div className="brand-profile-grid">
                <div className="field-group">
                  <label htmlFor="brand-brandName">
                    브랜드명
                    <span>필수</span>
                  </label>
                  <input
                    id="brand-brandName"
                    value={form.brandName}
                    maxLength={80}
                    autoComplete="organization"
                    disabled={isLoading || isSaving || isProductsSaving}
                    required
                    aria-invalid={Boolean(fieldErrors.brandName)}
                    aria-describedby={fieldErrors.brandName ? 'brand-name-error' : undefined}
                    onBlur={() => validateField('brandName')}
                    onChange={(event) => updateField('brandName', event.target.value)}
                  />
                  {fieldErrors.brandName ? (
                    <p id="brand-name-error" className="field-error">
                      {fieldErrors.brandName}
                    </p>
                  ) : null}
                </div>

                <div className="field-group">
                  <label htmlFor="brand-industry">
                    업종
                    <span>필수</span>
                  </label>
                  <input
                    id="brand-industry"
                    value={form.industry}
                    maxLength={80}
                    autoComplete="off"
                    disabled={isLoading || isSaving || isProductsSaving}
                    required
                    aria-invalid={Boolean(fieldErrors.industry)}
                    aria-describedby={fieldErrors.industry ? 'brand-industry-error' : undefined}
                    placeholder="예: 미용실, 음식점, 전문 서비스"
                    onBlur={() => validateField('industry')}
                    onChange={(event) => updateField('industry', event.target.value)}
                  />
                  {fieldErrors.industry ? (
                    <p id="brand-industry-error" className="field-error">
                      {fieldErrors.industry}
                    </p>
                  ) : null}
                </div>
              </div>

              <div className="field-group">
                <label htmlFor="brand-brandIntroduction">
                  브랜드·사업 소개
                  <span>필수</span>
                </label>
                <textarea
                  id="brand-brandIntroduction"
                  className="brand-textarea"
                  value={form.brandIntroduction}
                  maxLength={1_000}
                  disabled={isLoading || isSaving || isProductsSaving}
                  required
                  aria-invalid={Boolean(fieldErrors.brandIntroduction)}
                  aria-describedby={
                    fieldErrors.brandIntroduction
                      ? 'brand-introduction-help brand-introduction-error'
                      : 'brand-introduction-help'
                  }
                  placeholder="예: 개인과 사업자를 대상으로 보험 분석과 보장 점검을 제공합니다."
                  onBlur={() => validateField('brandIntroduction')}
                  onChange={(event) => updateField('brandIntroduction', event.target.value)}
                />
                <p id="brand-introduction-help" className="field-help">
                  누구에게 어떤 도움을 제공하는 브랜드인지 전체적인 특징을 적어 주세요.
                </p>
                {fieldErrors.brandIntroduction ? (
                  <p id="brand-introduction-error" className="field-error">
                    {fieldErrors.brandIntroduction}
                  </p>
                ) : null}
              </div>

              {additionalRequiredFields.map((field) => (
                <ProfileField
                  key={field.key}
                  field={field}
                  value={form[field.key]}
                  required
                  disabled={isLoading || isSaving || isProductsSaving}
                  errorMessage={fieldErrors[field.key as RequiredField]}
                  onChange={updateField}
                  onBlur={validateField}
                />
              ))}

            </form>
            <BrandProductsEditor
              userId={userId}
              savedValue={form.productsAndServices}
              savedPrices={productPrices}
              profileReady={Boolean(savedAt)}
              disabled={isLoading || isSaving}
              onBusyChange={setIsProductsSaving}
              onSaved={(profile) => {
                setForm((current) => ({ ...current, productsAndServices: profile.productsAndServices }));
                setProductPrices(profile.productPrices ?? {});
                setSavedAt(profile.updatedAt);
              }}
            />

            <section className="brand-optional-sections" aria-labelledby="brand-optional-heading">
              <header className="brand-optional-heading brand-category-heading">
                <h2 id="brand-optional-heading">선택 사항</h2>
                <p>
                  아래 5개 항목은 필요한 내용만 입력하세요. 비워 두어도 저장할 수 있습니다.
                </p>
              </header>

              <div className="brand-profile-grid">
                <div className="field-group">
                  <label htmlFor="brand-activityRegion">
                    활동 지역
                    <span>선택</span>
                  </label>
                  <input
                    id="brand-activityRegion"
                    form="brand-profile-form"
                    value={form.activityRegion}
                    maxLength={120}
                    autoComplete="off"
                    disabled={isLoading || isSaving || isProductsSaving}
                    placeholder="예: 서울 강남·서초"
                    onChange={(event) => updateField('activityRegion', event.target.value)}
                  />
                </div>
                <div className="field-group">
                  <label htmlFor="brand-defaultCta">
                    글 마지막 안내 문구
                    <span>선택</span>
                  </label>
                  <textarea
                    id="brand-defaultCta"
                    form="brand-profile-form"
                    className="brand-textarea"
                    value={form.defaultCta}
                    maxLength={300}
                    disabled={isLoading || isSaving || isProductsSaving}
                    aria-describedby="brand-cta-help"
                    placeholder="예: 자세한 일정은 상담으로 확인해 주세요."
                    onChange={(event) => updateField('defaultCta', event.target.value)}
                  />
                  <p id="brand-cta-help" className="field-help">
                    글 마지막에 독자에게 안내할 다음 행동입니다. 비워 두어도 됩니다.
                  </p>
                </div>
              </div>

              {optionalSections.map((section) => {
                const filledCount = section.fields
                  .filter((field) => form[field.key].trim()).length;

                return (
                  <section
                    className="brand-optional-section"
                    key={section.title}
                    aria-labelledby={`brand-section-${section.fields[0]?.key}`}
                  >
                    <header className="brand-optional-section-heading">
                      <div className="brand-optional-summary">
                        <h3 id={`brand-section-${section.fields[0]?.key}`}>{section.title}</h3>
                        <p>{section.description}</p>
                      </div>
                      <span className="brand-optional-count">
                        {filledCount}/{section.fields.length}개 입력
                      </span>
                    </header>

                    <div className="brand-optional-fields">
                      {section.fields.map((field) => (
                        <ProfileField
                          key={field.key}
                          field={field}
                          value={form[field.key]}
                          disabled={isLoading || isSaving || isProductsSaving}
                          onChange={updateField}
                        />
                      ))}
                    </div>
                  </section>
                );
              })}

              <p className="brand-format-note">
                스티커·인용구·구분선 기본 디자인은 실제 네이버 선택 목록을 연결하는 이미지·서식 단계에서 추가됩니다.
              </p>
            </section>
            <div className="connection-note brand-privacy-note">
              <ShieldCheck aria-hidden="true" />
              <p>
                고객 이름, 연락처, 계약·사건 내용 등 개인 또는 민감정보는 입력하지 마세요.
              </p>
            </div>

            <div className="brand-profile-actions">
              <button
                className="button primary connection-primary"
                type="submit"
                form="brand-profile-form"
                disabled={isLoading || isSaving || isProductsSaving}
              >
                {isSaving ? (
                  <LoaderCircle className="is-spinning" aria-hidden="true" />
                ) : (
                  <Save aria-hidden="true" />
                )}
                {isSaving ? '저장 중…' : '블로그 세팅 저장'}
              </button>
              {isDirty ? (
                <span className="unsaved-label">저장하지 않은 변경사항이 있습니다.</span>
              ) : null}
            </div>
          </div>
        </div>

        <aside className="connection-progress" aria-label="블로그 세팅 준비 상태">
          <header className="panel-heading compact">
            <div>
              <h2>작성한 정보는 이렇게 쓰여요</h2>
              <p>이 계정과 PC에서 만드는 글의 기본 정보가 됩니다.</p>
            </div>
          </header>

          <div className="live-status" role="status" aria-live="polite">
            {isLoading || isSaving || isProductsSaving ? (
              <LoaderCircle className="is-spinning" aria-hidden="true" />
            ) : savedAt && !isDirty ? (
              <CheckCircle2 aria-hidden="true" />
            ) : (
              <Circle aria-hidden="true" />
            )}
            <div>
              <strong>{statusLabel}</strong>
              <small>
                {savedAt
                  ? `마지막 저장: ${formatSavedAt(savedAt)}`
                  : '아직 저장된 블로그 세팅이 없습니다.'}
              </small>
            </div>
          </div>

          <ol className="step-list">
            <li className={`step-row ${hasRequiredFields ? 'is-complete' : 'is-current'}`}>
              <span className="step-icon">
                {hasRequiredFields ? <CheckCircle2 aria-hidden="true" /> : <Circle aria-hidden="true" />}
              </span>
              <span className="step-copy">
                <strong>필수 사항</strong>
                <small>필수 항목 {requiredFieldCount}/{requiredBrandProfileFields.length}개 입력</small>
              </span>
              <span className="step-state">{hasRequiredFields ? '입력됨' : '입력 필요'}</span>
            </li>
            <li className={`step-row ${optionalFieldCount > 0 ? 'is-complete' : ''}`}>
              <span className="step-icon">
                {optionalFieldCount > 0 ? <CheckCircle2 aria-hidden="true" /> : <Circle aria-hidden="true" />}
              </span>
              <span className="step-copy">
                <strong>선택 사항</strong>
                <small>선택 항목 {optionalFieldCount}/{optionalFieldKeys.length}개 입력</small>
              </span>
              <span className="step-state">{optionalFieldCount > 0 ? '반영' : '선택'}</span>
            </li>
            <li className={`step-row ${savedAt && !isDirty ? 'is-complete' : 'is-current'}`}>
              <span className="step-icon">
                {savedAt && !isDirty ? <HardDrive aria-hidden="true" /> : <Circle aria-hidden="true" />}
              </span>
              <span className="step-copy">
                <strong>계정별 로컬 저장</strong>
                <small>BLOW 서버에는 브랜드 프로필을 보내지 않습니다.</small>
              </span>
              <span className="step-state">{savedAt && !isDirty ? '저장됨' : '대기'}</span>
            </li>
          </ol>
        </aside>
      </section>

    </>
  );
}

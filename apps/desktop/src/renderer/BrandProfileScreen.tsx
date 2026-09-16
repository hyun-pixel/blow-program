import {
  CheckCircle2,
  Circle,
  ChevronDown,
  HardDrive,
  LoaderCircle,
  Save,
  ShieldCheck,
  XCircle,
} from 'lucide-react';
import { type FormEvent, useEffect, useState } from 'react';

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

type RequiredField = 'brandName' | 'industry' | 'brandIntroduction';
type FieldWithError = RequiredField | 'consultationLink';
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

const requiredFieldLabels: Record<RequiredField, string> = {
  brandName: '브랜드명',
  industry: '업종',
  brandIntroduction: '브랜드·사업 소개',
};

const requiredFieldMessages: Record<RequiredField, string> = {
  brandName: '브랜드명을 입력해 주세요.',
  industry: '업종을 입력해 주세요.',
  brandIntroduction: '브랜드·사업 소개를 입력해 주세요.',
};

function formatSavedAt(value: string): string {
  return new Intl.DateTimeFormat('ko-KR', {
    dateStyle: 'long',
    timeStyle: 'short',
  }).format(new Date(value));
}

type OptionalField = Exclude<keyof ProfileForm, RequiredField>;

interface OptionalFieldDefinition {
  readonly key: OptionalField;
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
  readonly fields: readonly OptionalFieldDefinition[];
}

const optionalSections: readonly OptionalSection[] = [
  {
    title: '운영 및 소개 정보',
    description: '가격·영업시간과 브랜드를 설명하는 사실',
    fields: [
      {
        key: 'productsAndServices',
        label: '주요 상품·서비스',
        placeholder: '예: 실손·건강보험 보장 점검, 자동차보험 상담',
        maxLength: 1_500,
        multiline: true,
        wide: true,
        help: '여러 개라면 한 줄에 하나씩 적어 주세요. 비워 두어도 됩니다.',
      },
      {
        key: 'priceInfo',
        label: '가격 정보',
        placeholder: '예: 기본 상담 무료, 서비스별 가격은 상담 후 안내',
        maxLength: 300,
        multiline: true,
        help: '현재 실제로 적용하는 가격과 조건만 입력해 주세요.',
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
    ],
  },
  {
    title: '글에 적용할 표현 기준',
    description: '항상 강조하거나 사용하지 않을 문구',
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
        key: 'mustEmphasize',
        label: '반드시 강조할 내용',
        placeholder: '예: 모든 상담은 예약제로 운영',
        maxLength: 1_000,
        multiline: true,
        wide: true,
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
  {
    title: '연락 및 예약 정보',
    description: '글 마지막 안내에 사용할 공개 정보',
    fields: [
      {
        key: 'phoneNumber',
        label: '전화번호',
        placeholder: '예: 02-1234-5678',
        maxLength: 80,
        inputType: 'tel',
        autoComplete: 'tel',
      },
      {
        key: 'address',
        label: '주소',
        placeholder: '예: 서울특별시 강남구…',
        maxLength: 300,
        multiline: true,
        autoComplete: 'street-address',
      },
      {
        key: 'consultationLink',
        label: '예약·상담 링크',
        placeholder: '예: https://booking.naver.com/…',
        maxLength: 2_048,
        inputType: 'url',
        autoComplete: 'url',
        wide: true,
        help: 'http:// 또는 https://로 시작하는 전체 주소를 입력해 주세요.',
      },
    ],
  },
  {
    title: '이미지 기본 방향',
    description: 'AI 이미지 생성 때 우선 적용할 색상과 분위기',
    fields: [
      {
        key: 'accentColor',
        label: '강조색',
        placeholder: '예: 짙은 파란색, #1E40AF',
        maxLength: 100,
      },
      {
        key: 'imageStyle',
        label: '이미지 스타일',
        placeholder: '예: 밝은 자연광의 현실적인 매장 사진 분위기',
        maxLength: 500,
        multiline: true,
        wide: true,
      },
    ],
  },
];

const optionalFieldKeys: readonly OptionalField[] = [
  'activityRegion',
  'defaultCta',
  'defaultTone',
  ...optionalSections.flatMap((section) => section.fields.map((field) => field.key)),
];

function getConsultationLinkError(value: string): string | undefined {
  const trimmedValue = value.trim();
  if (!trimmedValue) return undefined;

  try {
    const url = new URL(trimmedValue);
    if (url.protocol === 'http:' || url.protocol === 'https:') return undefined;
  } catch {
    // The message below covers invalid URL input without exposing technical details.
  }

  return '예약·상담 링크는 http:// 또는 https://로 시작하는 전체 주소로 입력해 주세요.';
}

function OptionalProfileField({
  field,
  value,
  disabled,
  errorMessage,
  onChange,
}: {
  readonly field: OptionalFieldDefinition;
  readonly value: string;
  readonly disabled: boolean;
  readonly errorMessage?: string | undefined;
  readonly onChange: (field: OptionalField, value: string) => void;
}) {
  const inputId = `brand-${field.key}`;
  const helpId = field.help ? `${inputId}-help` : undefined;
  const errorId = errorMessage ? `${inputId}-error` : undefined;
  const describedBy = [helpId, errorId].filter(Boolean).join(' ') || undefined;

  return (
    <div className={`field-group ${field.wide ? 'is-wide' : ''}`}>
      <label htmlFor={inputId}>
        {field.label}
        <span>선택</span>
      </label>
      {field.multiline ? (
        <textarea
          id={inputId}
          className="brand-textarea"
          value={value}
          maxLength={field.maxLength}
          disabled={disabled}
          autoComplete={field.autoComplete}
          aria-invalid={Boolean(errorMessage)}
          aria-describedby={describedBy}
          placeholder={field.placeholder}
          onChange={(event) => onChange(field.key, event.target.value)}
        />
      ) : (
        <input
          id={inputId}
          type={field.inputType ?? 'text'}
          value={value}
          maxLength={field.maxLength}
          disabled={disabled}
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

export function BrandProfileScreen({ userId }: { readonly userId: string }) {
  const [form, setForm] = useState<ProfileForm>(emptyProfile);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isDirty, setIsDirty] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    void window.blowBrandProfile.get(userId).then((response) => {
      if (!active) return;

      if (response.ok) {
        if (response.profile) {
          const {
            updatedAt,
            ...savedProfile
          } = response.profile;
          setForm(savedProfile);
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
        (field === 'brandName' || field === 'industry' || field === 'brandIntroduction')
        && value.trim()
      )
      || field === 'consultationLink'
    ) {
      setFieldErrors((current) => ({ ...current, [field]: undefined }));
    }
  };

  const validateField = (field: RequiredField): void => {
    setFieldErrors((current) => ({
      ...current,
      [field]: form[field].trim()
        ? undefined
        : requiredFieldMessages[field],
    }));
  };

  const saveProfile = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    const nextErrors = (Object.keys(requiredFieldLabels) as RequiredField[])
      .reduce<FieldErrors>((errors, field) => {
        if (!form[field].trim()) {
          errors[field] = requiredFieldMessages[field];
        }
        return errors;
      }, {});
    const consultationLinkError = getConsultationLinkError(form.consultationLink);
    if (consultationLinkError) {
      nextErrors.consultationLink = consultationLinkError;
    }


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
    const response = await window.blowBrandProfile.save(userId, form);

    if (response.ok && response.profile) {
      const {
        updatedAt,
        ...savedProfile
      } = response.profile;
      setForm(savedProfile);
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

    setIsSaving(false);
  };

  const hasRequiredFields = Boolean(
    form.brandName.trim()
    && form.industry.trim()
    && form.brandIntroduction.trim(),
  );
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
      <header className="page-head">
        <div>
          <h1>브랜드 프로필</h1>
          <p>
            글마다 반복하지 않을 브랜드 기본 정보를 이 PC에 저장합니다.
          </p>
        </div>
      </header>

      {errorMessage ? (
        <div className="message error-message" role="alert">
          <XCircle aria-hidden="true" />
          <div>
            <h2>브랜드 프로필 작업을 완료하지 못했습니다</h2>
            <p>{errorMessage}</p>
          </div>
        </div>
      ) : null}

      {notice ? (
        <div className="message success-message" role="status">
          <CheckCircle2 aria-hidden="true" />
          <div>
            <h2>브랜드 프로필 저장 완료</h2>
            <p>{notice}</p>
          </div>
        </div>
      ) : null}

      <section
        className="connection-workbench brand-profile-workbench"
        aria-labelledby="brand-profile-heading"
        aria-busy={isLoading || isSaving}
      >
        <div className="connection-form-panel">
          <header className="panel-heading compact">
            <div>
              <h2 id="brand-profile-heading">브랜드 기본 정보</h2>
              <p>사실에 근거한 정보만 입력하면 글 생성 때 일관되게 반영됩니다.</p>
            </div>
          </header>

          <form
            className="connection-form brand-profile-form"
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
                  disabled={isLoading || isSaving}
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
                  disabled={isLoading || isSaving}
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
                disabled={isLoading || isSaving}
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

            <div className="brand-profile-grid">
              <div className="field-group">
                <label htmlFor="brand-activityRegion">
                  활동 지역
                  <span>선택</span>
                </label>
                <input
                  id="brand-activityRegion"
                  value={form.activityRegion}
                  maxLength={120}
                  autoComplete="off"
                  disabled={isLoading || isSaving}
                  placeholder="예: 서울 강남·서초"
                  onChange={(event) => updateField('activityRegion', event.target.value)}
                />
              </div>

              <div className="field-group">
                <label htmlFor="brand-defaultTone">
                  기본 말투
                  <span>선택</span>
                </label>
                <input
                  id="brand-defaultTone"
                  value={form.defaultTone}
                  maxLength={300}
                  autoComplete="off"
                  disabled={isLoading || isSaving}
                  placeholder="예: 쉽고 친절한 존댓말"
                  onChange={(event) => updateField('defaultTone', event.target.value)}
                />
              </div>
            </div>

            <div className="field-group">
              <label htmlFor="brand-defaultCta">
                기본 행동 유도 문구
                <span>선택</span>
              </label>
              <textarea
                id="brand-defaultCta"
                className="brand-textarea"
                value={form.defaultCta}
                maxLength={300}
                disabled={isLoading || isSaving}
                aria-describedby="brand-cta-help"
                placeholder="예: 자세한 일정은 상담으로 확인해 주세요."
                onChange={(event) => updateField('defaultCta', event.target.value)}
              />
              <p id="brand-cta-help" className="field-help">
                글 마지막에 독자에게 안내할 다음 행동입니다. 비워 두어도 됩니다.
              </p>
            </div>


            <section className="brand-optional-sections" aria-labelledby="brand-optional-heading">
              <header className="brand-optional-heading">
                <h3 id="brand-optional-heading">추가 선택 정보</h3>
                <p>
                  필요한 항목만 열어 입력하세요. 비워 둔 내용은 AI가 임의로 만들지 않습니다.
                </p>
              </header>

              {optionalSections.map((section) => {
                const filledCount = section.fields
                  .filter((field) => form[field.key].trim()).length;

                return (
                  <details className="brand-optional-section" key={section.title}>
                    <summary>
                      <span className="brand-optional-summary">
                        <strong>{section.title}</strong>
                        <small>{section.description}</small>
                      </span>
                      <span className="brand-optional-count">
                        {filledCount}/{section.fields.length}개 입력
                      </span>
                      <ChevronDown className="brand-optional-chevron" aria-hidden="true" />
                    </summary>

                    <div className="brand-optional-fields">
                      {section.fields.map((field) => (
                        <OptionalProfileField
                          key={field.key}
                          field={field}
                          value={form[field.key]}
                          disabled={isLoading || isSaving}
                          errorMessage={
                            field.key === 'consultationLink'
                              ? fieldErrors.consultationLink
                              : undefined
                          }
                          onChange={updateField}
                        />
                      ))}
                    </div>
                  </details>
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
                disabled={isLoading || isSaving}
              >
                {isSaving ? (
                  <LoaderCircle className="is-spinning" aria-hidden="true" />
                ) : (
                  <Save aria-hidden="true" />
                )}
                {isSaving ? '저장 중…' : '브랜드 프로필 저장'}
              </button>
              {isDirty ? (
                <span className="unsaved-label">저장하지 않은 변경사항이 있습니다.</span>
              ) : null}
            </div>
          </form>
        </div>

        <aside className="connection-progress" aria-label="브랜드 프로필 준비 상태">
          <header className="panel-heading compact">
            <div>
              <h2>저장 상태</h2>
              <p>현재 로그인 계정과 이 PC에만 연결됩니다.</p>
            </div>
          </header>

          <div className="live-status" role="status" aria-live="polite">
            {isLoading || isSaving ? (
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
                  : '아직 저장된 브랜드 프로필이 없습니다.'}
              </small>
            </div>
          </div>

          <ol className="step-list">
            <li className={`step-row ${hasRequiredFields ? 'is-complete' : 'is-current'}`}>
              <span className="step-icon">
                {hasRequiredFields ? <CheckCircle2 aria-hidden="true" /> : <Circle aria-hidden="true" />}
              </span>
              <span className="step-copy">
                <strong>필수 정보</strong>
                <small>브랜드명, 업종, 브랜드·사업 소개</small>
              </span>
              <span className="step-state">{hasRequiredFields ? '입력됨' : '입력 필요'}</span>
            </li>
            <li className={`step-row ${optionalFieldCount > 0 ? 'is-complete' : ''}`}>
              <span className="step-icon">
                {optionalFieldCount > 0 ? <CheckCircle2 aria-hidden="true" /> : <Circle aria-hidden="true" />}
              </span>
              <span className="step-copy">
                <strong>선택 정보</strong>
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

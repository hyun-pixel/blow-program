// The writing menu is curated, but server approval and API-key availability still apply.
export const writingModelNames: Readonly<Record<string, string>> = {
  'gpt-5.6-luna': 'GPT-5.6 Luna',
  'gpt-5.6-terra': 'GPT-5.6 Terra',
  'gpt-6-astra': 'GPT-6 Astra',
};

export const reasoningEfforts = [
  'none',
  'low',
  'medium',
  'high',
  'xhigh',
  'max',
] as const;

export type ReasoningEffort = (typeof reasoningEfforts)[number];

export interface AllowedModel {
  readonly modelId: string;
  readonly displayName: string;
  readonly description: string;
  readonly recommendedUse: string;
  readonly allowedReasoningEfforts: readonly ReasoningEffort[];
  readonly isDefault: boolean;
  readonly sortOrder: number;
}

export interface ModelPreference {
  readonly modelId: string;
  readonly reasoningEffort: ReasoningEffort;
}

export interface SavedModelPreferenceResult {
  readonly preference: ModelPreference | null;
  readonly invalid: boolean;
}

export const reasoningEffortLabels: Readonly<Record<ReasoningEffort, string>> = {
  none: '사용 안 함',
  low: '낮음',
  medium: '중간',
  high: '높음',
  xhigh: '매우 높음',
  max: '최대',
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isReasoningEffort(value: unknown): value is ReasoningEffort {
  return typeof value === 'string'
    && reasoningEfforts.includes(value as ReasoningEffort);
}

export function parseAllowedModels(value: unknown): readonly AllowedModel[] {
  if (!Array.isArray(value)) return [];

  const seen = new Set<string>();

  return value.flatMap((row) => {
    if (!isRecord(row)) return [];

    const modelId = row.model_id;
    const displayName = row.display_name;
    const description = row.description;
    const recommendedUse = row.recommended_use;
    const efforts = row.allowed_reasoning_efforts;
    const isDefault = row.is_default;
    const sortOrder = row.sort_order;

    if (
      typeof modelId !== 'string'
      || !modelId
      || seen.has(modelId)
      || typeof displayName !== 'string'
      || !displayName
      || typeof description !== 'string'
      || !description
      || typeof recommendedUse !== 'string'
      || !recommendedUse
      || !Array.isArray(efforts)
      || efforts.length === 0
      || !efforts.every(isReasoningEffort)
      || typeof isDefault !== 'boolean'
      || typeof sortOrder !== 'number'
      || !Number.isInteger(sortOrder)
    ) {
      return [];
    }

    seen.add(modelId);

    return [{
      modelId,
      displayName,
      description,
      recommendedUse,
      allowedReasoningEfforts: [...new Set(efforts)],
      isDefault,
      sortOrder,
    }];
  });
}

export function getSelectableModels(
  allowedModels: readonly AllowedModel[],
  availableModelIds: readonly string[],
): readonly AllowedModel[] {
  const available = new Set(availableModelIds);

  return allowedModels
    .filter((model) => Object.hasOwn(writingModelNames, model.modelId) && available.has(model.modelId))
    .map((model) => ({ ...model, displayName: writingModelNames[model.modelId]! }))
    .sort((left, right) => right.sortOrder - left.sortOrder);
}

export function readSavedModelPreference(
  rawValue: string | null,
  selectableModels: readonly AllowedModel[],
): SavedModelPreferenceResult {
  if (rawValue === null) return { preference: null, invalid: false };

  try {
    const value: unknown = JSON.parse(rawValue);
    if (!isRecord(value)) return { preference: null, invalid: true };

    const modelId = value.modelId;
    const reasoningEffort = value.reasoningEffort;
    const model = selectableModels.find((candidate) => candidate.modelId === modelId);

    if (!model || !isReasoningEffort(reasoningEffort)
      || !model.allowedReasoningEfforts.includes(reasoningEffort)) {
      return { preference: null, invalid: true };
    }

    return { preference: { modelId: model.modelId, reasoningEffort }, invalid: false };
  } catch {
    return { preference: null, invalid: true };
  }
}

import { describe, expect, it } from 'vitest';
import {
  getSelectableModels,
  parseAllowedModels,
  readSavedModelPreference,
} from './model-options.js';

const allowedRows = [
  {
    model_id: 'gpt-5.6-luna',
    display_name: 'GPT-5.6 Luna',
    description: '빠른 모델',
    recommended_use: '초안',
    allowed_reasoning_efforts: ['none', 'low', 'medium'],
    is_default: false,
    sort_order: 10,
  },
  {
    model_id: 'gpt-5.6-terra',
    display_name: 'GPT-5.6 Terra',
    description: '균형 모델',
    recommended_use: '일반 글',
    allowed_reasoning_efforts: ['low', 'medium', 'high'],
    is_default: true,
    sort_order: 20,
  },
] as const;

describe('allowed model options', () => {
  it('validates server rows and preserves only supported reasoning efforts', () => {
    const models = parseAllowedModels([
      ...allowedRows,
      {
        model_id: 'invalid-model',
        display_name: 'Invalid',
        description: '잘못된 행',
        recommended_use: '사용 안 함',
        allowed_reasoning_efforts: ['unknown'],
        is_default: false,
        sort_order: 0,
      },
    ]);

    expect(models).toHaveLength(2);
    expect(models[1]?.allowedReasoningEfforts).toEqual(['low', 'medium', 'high']);
  });

  it('shows only models allowed by BLOW and available to the saved API key', () => {
    const selectable = getSelectableModels(
      parseAllowedModels(allowedRows),
      ['gpt-5.6-terra', 'unapproved-model'],
    );

    expect(selectable.map((model) => model.modelId)).toEqual(['gpt-5.6-terra']);
  });

  it('sorts selectable models by the operator order', () => {
    const selectable = getSelectableModels(
      parseAllowedModels(allowedRows),
      ['gpt-5.6-luna', 'gpt-5.6-terra'],
    );

    expect(selectable.map((model) => model.modelId)).toEqual([
      'gpt-5.6-terra',
      'gpt-5.6-luna',
    ]);
  });
});

describe('saved model preference', () => {
  const models = parseAllowedModels(allowedRows);

  it('restores a model and reasoning effort only when both remain supported', () => {
    expect(readSavedModelPreference(JSON.stringify({
      modelId: 'gpt-5.6-terra',
      reasoningEffort: 'high',
    }), models)).toEqual({
      preference: {
        modelId: 'gpt-5.6-terra',
        reasoningEffort: 'high',
      },
      invalid: false,
    });
  });

  it('requires reselection instead of silently substituting an unavailable model', () => {
    expect(readSavedModelPreference(JSON.stringify({
      modelId: 'retired-model',
      reasoningEffort: 'medium',
    }), models)).toEqual({
      preference: null,
      invalid: true,
    });
  });

  it('rejects a saved effort that the selected model no longer supports', () => {
    expect(readSavedModelPreference(JSON.stringify({
      modelId: 'gpt-5.6-luna',
      reasoningEffort: 'max',
    }), models)).toEqual({
      preference: null,
      invalid: true,
    });
  });
});

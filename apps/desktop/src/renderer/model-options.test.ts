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
  it('curates three real model IDs and names without widening operator approval', () => {
    const extra = {
      ...allowedRows[0], model_id: 'gpt-6-astra', display_name: '다른 표시 이름',
      allowed_reasoning_efforts: ['low', 'medium', 'high'], sort_order: 40,
    };
    const rows = [...allowedRows, extra, { ...extra, model_id: 'gpt-5.6-sol' }];
    const models = getSelectableModels(parseAllowedModels(rows), [
      'gpt-5.6-luna', 'gpt-5.6-terra', 'gpt-6-astra', 'gpt-5.6-sol',
    ]);
    expect(models.map(({ modelId, displayName }) => [modelId, displayName])).toEqual([
      ['gpt-6-astra', 'GPT-6 Astra'],
      ['gpt-5.6-terra', 'GPT-5.6 Terra'],
      ['gpt-5.6-luna', 'GPT-5.6 Luna'],
    ]);
    expect(models[0]?.allowedReasoningEfforts).not.toContain('none');
    expect(getSelectableModels([], ['gpt-6-astra'])).toEqual([]);
    expect(getSelectableModels(parseAllowedModels(rows), [])).toEqual([]);
    expect(readSavedModelPreference(JSON.stringify({
      modelId: 'gpt-5.6-sol', reasoningEffort: 'medium',
    }), models)).toEqual({ preference: null, invalid: true });
  });

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

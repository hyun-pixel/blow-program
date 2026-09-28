import { describe, expect, it, vi } from 'vitest';
import { normalizeBrandProfile } from './brand-profile.js';
import {
  normalizeTopicRecommendationRequest, parseTopicSuggestions, recommendOpenAiTopics,
} from './openai-topic-recommendation.js';

const input = {
  userId: '8573e7bb-9257-49bc-a419-6f0f5ad9f1fb', topic: '처음 방문하는 카페 고객 안내',
  modelId: 'test-approved-model', reasoningEffort: 'low', previousSuggestions: [],
};
const profile = { ...normalizeBrandProfile({
  brandName: '테스트 카페', industry: '카페', brandIntroduction: '커피와 디저트를 소개합니다.',
  productsAndServices: '아메리카노\n케이크', productPrices: { '아메리카노': '4,500원' },
  targetCustomers: '처음 방문하는 고객', prohibitedPhrases: '무조건 최고',
  phoneNumber: 'DO-NOT-SEND-PHONE', address: 'DO-NOT-SEND-ADDRESS',
}), updatedAt: '2026-09-24T00:00:00Z' };
const suggestions = [1, 2, 3].map(n => ({
  title: '안내 방향 ' + n, content: '처음 방문하는 고객이 확인할 사항과 선택 기준을 정리해 주세요. 방향 ' + n,
}));
const payload = (items: unknown = suggestions) => ({
  status: 'completed',
  output: [{ type: 'message', content: [{ type: 'output_text', text: JSON.stringify({ suggestions: items }) }] }],
});

describe('topic recommendation', () => {
  it.each([
    null, [], { ...input, topic: ' ' }, { ...input, topic: '가'.repeat(501) },
    { ...input, modelId: 'bad model' }, { ...input, reasoningEffort: 'ultra' },
    { ...input, userId: '../../someone' }, { ...input, previousSuggestions: ['가'.repeat(501)] },
    { ...input, previousSuggestions: [1] }, { ...input, previousSuggestions: Array(4).fill('이전 추천') },
  ])('rejects invalid input before using the API: %j', async candidate => {
    const fetchMock = vi.fn();
    await expect(recommendOpenAiTopics('fake-key', candidate, profile, fetchMock)).rejects.toThrow();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('normalizes the topic, ID and previous suggestions', () => {
    expect(normalizeTopicRecommendationRequest({ ...input, topic: ' 카페 안내 ', previousSuggestions: [' 이전 추천 '] }))
      .toMatchObject({ topic: '카페 안내', previousSuggestions: ['이전 추천'] });
  });

  it('sends one bounded structured request using the chosen model and prior suggestions, without contact data', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify(payload()), { status: 200 }));
    const result = await recommendOpenAiTopics('fake-key', { ...input, previousSuggestions: ['이전 방향'] }, profile, fetchMock);
    expect(result).toEqual({ ok: true, suggestions });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = (fetchMock.mock.calls as unknown as [string, RequestInit][])[0]!;
    expect(url).toBe('https://api.openai.com/v1/responses');
    expect(init.headers).toMatchObject({ Authorization: 'Bearer fake-key' });
    const body = JSON.parse(String(init.body));
    expect(body).toMatchObject({ model: input.modelId, reasoning: { effort: 'low' }, store: false, max_output_tokens: 4000 });
    expect(body.text.format).toMatchObject({ type: 'json_schema', strict: true });
    expect(body.text.format.schema.properties.suggestions).toMatchObject({ minItems: 3, maxItems: 3 });
    expect(JSON.parse(body.input)).toMatchObject({ topic: input.topic, previousSuggestions: ['이전 방향'], brand: { brandName: profile.brandName } });
    expect(JSON.parse(body.input).brand.productsAndServices).toBe('아메리카노 (가격: 4,500원)\n케이크');
    expect(String(init.body)).not.toContain('DO-NOT-SEND');
    expect(String(init.body)).not.toContain('fake-key');
  });

  it.each([
    payload([]), payload(suggestions.slice(0, 2)), payload([...suggestions, suggestions[0]]),
    payload([suggestions[0], suggestions[0], suggestions[2]]),
    payload([{ title: 'bad', content: '짧음' }, ...suggestions.slice(1)]),
    payload([{ title: 'bad', content: '가'.repeat(501) }, ...suggestions.slice(1)]),
    { ...payload(), status: 'incomplete' },
    { status: 'completed', output: [{ content: [{ type: 'refusal', refusal: 'No' }] }] },
    { status: 'completed', output_text: 'not json' },
  ])('rejects incomplete, refused, duplicated or malformed output', value => {
    expect(parseTopicSuggestions(value)).toBeNull();
  });

  it.each([[401, 'AUTH_FAILED'], [403, 'AUTH_FAILED'], [429, 'RATE_LIMITED'], [500, 'SERVICE_ERROR']] as const)(
    'returns safe errors without retry for HTTP %s', async (status, code) => {
      const fetchMock = vi.fn(async () => new Response('private diagnostic fake-key', { status }));
      const result = await recommendOpenAiTopics('fake-key', input, profile, fetchMock);
      expect(result).toMatchObject({ ok: false, code });
      expect(JSON.stringify(result)).not.toContain('fake-key');
      expect(fetchMock).toHaveBeenCalledTimes(1);
    },
  );

  it('does not automatically retry malformed output', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify(payload([]))));
    expect(await recommendOpenAiTopics('fake-key', input, profile, fetchMock)).toMatchObject({ code: 'OUTPUT_INVALID' });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('returns safe network and timeout errors', async () => {
    for (const [name, code] of [['Error', 'NETWORK_ERROR'], ['TimeoutError', 'TIMEOUT']]) {
      const result = await recommendOpenAiTopics('fake-key', input, profile, async () => {
        const error = new Error('private fake-key'); error.name = name!; throw error;
      });
      expect(result).toMatchObject({ ok: false, code });
      expect(JSON.stringify(result)).not.toContain('fake-key');
    }
  });

  it('does not send a cancelled request or return a late response after cancellation', async () => {
    const controller = new AbortController();
    controller.abort();
    const fetchMock = vi.fn();
    expect(await recommendOpenAiTopics('fake-key', input, profile, fetchMock, controller.signal)).toMatchObject({ code: 'CANCELLED' });
    expect(fetchMock).not.toHaveBeenCalled();
    const later = new AbortController();
    const result = await recommendOpenAiTopics('fake-key', input, profile, async () => {
      later.abort(); return new Response(JSON.stringify(payload()));
    }, later.signal);
    expect(result).toMatchObject({ code: 'CANCELLED' });
  });
});

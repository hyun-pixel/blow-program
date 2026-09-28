import { describe, expect, it } from 'vitest';
import { resolveDecorationTargets, decorationPlacementLabel, defaultPostDecorations, dividerChoices, quoteChoices, isDecorationStyleAvailable } from './post-decoration.js';

describe('post decoration preparation', () => {
  it('does not opt users into any decoration by default', () => {
    expect(Object.values(defaultPostDecorations).every((item) => !item.enabled && item.count === 1)).toBe(true);
    expect(Object.values(defaultPostDecorations).every((item) => !('mode' in item) && !('regions' in item))).toBe(true);
  });
  const base = { ...defaultPostDecorations.divider, enabled: true };
  const paragraphs = Array.from({ length: 12 }, (_, index) => `안내 문단 ${index + 1}입니다.`);
  it.each([1, 2, 3, 4, 5, 6, 7, 8, 9, 10])('selects %i unique ordered paragraph endings', (count) => {
    const targets = resolveDecorationTargets({ ...base, count }, paragraphs);
    expect(targets).toHaveLength(count);
    expect(new Set(targets.map((target) => target.paragraphNumber)).size).toBe(count);
    expect(targets.every((target) => target.paragraphNumber > 0 && target.paragraphNumber <= paragraphs.length && target.position === 'after')).toBe(true);
    expect(targets.map((target) => target.paragraphNumber)).toEqual([...targets.map((target) => target.paragraphNumber)].sort((a,b) => a-b));
    expect(decorationPlacementLabel({ ...base, count })).toBe(`${count}회 랜덤 배치`);
  });
  it('randomly selects among equally suitable boundaries and spreads out if possible', () => {
    const first = resolveDecorationTargets({ ...base, count: 3 }, paragraphs, () => 0);
    const last = resolveDecorationTargets({ ...base, count: 3 }, paragraphs, () => 0.999);
    expect(first.map((target) => target.paragraphNumber)).toEqual([1,3,5]);
    expect(last.map((target) => target.paragraphNumber)).toEqual([8,10,12]);
    expect(first).not.toEqual(last);
  });
  it('prioritizes topic transitions, the boundary before a heading, and conclusions over other endings', () => {
    const text = ['소개 문단입니다.', '이어서 메뉴를 살펴봅니다.', '메뉴 설명입니다.', '## 방문 안내', '방문 안내 본문입니다.', '정리하면, 취향에 맞춰 선택해 보세요.'];
    for (const random of [() => 0, () => 0.999]) {
      expect(resolveDecorationTargets({ ...base, count: 4 }, text, random).map((target) => target.paragraphNumber)).toEqual([1,3,5,6]);
    }
  });
  it('does not separate headings, a list introduction, or consecutive list items from their content', () => {
    const text = ['# 메뉴', '설명입니다.', '**가격 안내**', '다음 항목을 확인하세요:', '- 첫 번째 항목입니다.', '- 두 번째 항목입니다.', '1. 방문 방법', '방문 안내입니다.', '[마무리]', '이상으로, 안내를 마칩니다.'];
    expect(resolveDecorationTargets({ ...base, count: 10 }, text).map((target) => target.paragraphNumber)).toEqual([2,6,8,10]);
  });
  it('recognizes short unmarked Korean headings without separating their explanation', () => {
    const text = ['메뉴 설명입니다.', '방문 안내', '예약 방법을 확인해 주세요.', '가격 비교', '가격 설명입니다.'];
    expect(resolveDecorationTargets({ ...base, count: 10 }, text).map((target) => target.paragraphNumber)).toEqual([1,3,5]);
  });
  it('uses sentence endings before unpunctuated fallback boundaries', () => {
    expect(resolveDecorationTargets(base, ['아직 이어지는 설명', '문장 끝입니다.', '다음 설명', '남은 설명'], () => 0)[0]?.paragraphNumber).toBe(2);
  });
  it('caps short drafts without duplicates, preserves paragraph numbering and accepts the final ending', () => {
    expect(resolveDecorationTargets({ ...base, count: 10 }, ['A.','B.'])).toHaveLength(2);
    expect(resolveDecorationTargets({ ...base, count: 10 }, ['A.'])).toEqual([{ paragraphNumber: 1, position: 'after' }]);
    expect(resolveDecorationTargets({ ...base, count: 10 }, ['  ','내용입니다.','\t'])).toEqual([{ paragraphNumber: 2, position: 'after' }]);
    expect(resolveDecorationTargets(base, ['# 제목', '**소제목**', '  '])).toEqual([]);
    expect(resolveDecorationTargets(base, [])).toEqual([]);
    expect(resolveDecorationTargets({ ...base, enabled: false }, paragraphs)).toEqual([]);
  });
  it.each([0, -1, 11, 1.5, NaN, Infinity])('rejects invalid insertion counts %s', (count) => {
    expect(resolveDecorationTargets({ ...base, count }, paragraphs)).toEqual([]);
  });
  it('requires a live list even when random was selected', () => {
    expect(isDecorationStyleAvailable('random', [])).toBe(false);
    expect(isDecorationStyleAvailable('random', [{ id: 'default' }])).toBe(true);
  });
  it('blocks unavailable styles rather than silently substituting another', () => {
    expect(isDecorationStyleAvailable('line7', [{ id: 'line1' }])).toBe(false);
    expect(isDecorationStyleAvailable('line1', [{ id: 'line1' }])).toBe(true);
    expect(isDecorationStyleAvailable('quotation_corner', [{ id: 'default' }])).toBe(false);
  });
  it('offers unique IDs already supported by the Naver adapter', () => {
    expect(dividerChoices.map((item) => item.value)).toEqual(['random','default','line1','line2','line3','line4','line5','line6','line7']);
    expect(quoteChoices.map((item) => item.value)).toEqual(['random','default','quotation_line','quotation_bubble','quotation_underline','quotation_postit','quotation_corner']);
  });
});

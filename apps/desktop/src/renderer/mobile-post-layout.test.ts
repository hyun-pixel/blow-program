import { describe, expect, it } from 'vitest';
import { formatMobileParagraphs, planInlineImages } from './mobile-post-layout.js';

describe('mobile blog layout without a paid rewrite', () => {
  it('breaks a long block at sentences and preserves text and keyword spelling', () => {
    const body = '실손 보험은 약관을 먼저 확인하는 것이 중요합니다. '.repeat(15);
    const paragraphs = formatMobileParagraphs(body, ['실손 보험']);
    expect(paragraphs.length).toBeGreaterThan(5);
    expect(paragraphs.every(text => text.length <= 110)).toBe(true);
    expect(paragraphs.join('').replace(/\s/g, '')).toBe(body.replace(/\s/g, ''));
    expect(paragraphs.join('\n\n').split('실손 보험')).toHaveLength(16);
  });
  it('preserves headings, lists, decimal values, URLs, emojis and existing short paragraphs', () => {
    const paragraphs = ['가입 전 확인', '1. 약관 확인', '보험료는 1.5%이며 https://example.com/a 를 확인합니다. 🙂', '2. 면책 확인'];
    expect(formatMobileParagraphs(paragraphs.join('\n\n'))).toEqual(paragraphs);
  });
  it('breaks long sentences at spaces, not inside a protected keyword', () => {
    const keyword = '반드시 유지할 긴 키워드';
    const body = `${'확인할 내용 '.repeat(15)}${keyword} ${'다음 확인 항목 '.repeat(20)}입니다.`;
    const paragraphs = formatMobileParagraphs(body, [keyword]);
    expect(paragraphs.join('\n\n')).toContain(keyword);
    expect(paragraphs.join('').replace(/\s/g, '')).toBe(body.replace(/\s/g, ''));
    expect(paragraphs.length).toBeGreaterThan(2);
  });
  it('never invents word spacing for an unbroken token', () => {
    expect(formatMobileParagraphs('가'.repeat(300))).toEqual(['가'.repeat(300)]);
  });
  it('distributes four images inside the article and keeps headings with their body', () => {
    const paragraphs = ['도입입니다.', '가입 전 확인', ...Array.from({ length: 12 }, (_, index) => `항목 ${index}에 대한 설명입니다. `.repeat(4)), '마지막으로, 정리합니다.'];
    const positions = planInlineImages(paragraphs, 4);
    expect(positions).toHaveLength(4);
    expect(new Set(positions).size).toBe(4);
    expect(positions).not.toContain(2);
    expect(positions).not.toContain(paragraphs.length);
    expect(positions[3]! - positions[0]!).toBeGreaterThan(5);
  });
  it('does not append images when there is no safe inner boundary', () => {
    expect(() => planInlineImages(['한 문단입니다.'], 1)).toThrow('문단 경계');
    expect(planInlineImages(['첫 문단.', '둘째 문단.'], 3)).toEqual([1, 1, 1]);
  });
});

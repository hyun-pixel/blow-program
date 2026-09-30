import type { NaverDividerStyleSelection, NaverQuoteStyleSelection } from '@blow/naver-adapter';

export const MAX_DECORATION_COUNT = 10;
export interface DecorationPlacement {
  readonly enabled: boolean;
  readonly count: number;
}
export interface DecorationTarget {
  readonly paragraphNumber: number;
  readonly position: 'after';
}

export interface PostDecorations {
  readonly divider: DecorationPlacement & { readonly style: NaverDividerStyleSelection };
  readonly quote: DecorationPlacement & { readonly style: NaverQuoteStyleSelection };
  readonly sticker: DecorationPlacement & { readonly categoryMode: 'random' | 'manual'; readonly categoryLabel?: string };
}

export const defaultPostDecorations: PostDecorations = {
  divider: { enabled: false, count: 1, style: 'random' },
  quote: { enabled: false, count: 1, style: 'random' },
  sticker: { enabled: false, count: 1, categoryMode: 'random' },
};

// IDs match the existing Naver adapter; availability is checked against the live editor.
export const dividerChoices: readonly { value: NaverDividerStyleSelection; label: string }[] = [
  { value: 'random', label: '사용 가능한 디자인 중 무작위' },
  ...(['default', 'line1', 'line2', 'line3', 'line4', 'line5', 'line6', 'line7'] as const)
    .map((value, index) => ({ value, label: `구분선 ${index + 1}${index === 0 ? ' (기본)' : ''}` })),
];

export const quoteChoices: readonly { value: NaverQuoteStyleSelection; label: string }[] = [
  { value: 'random', label: '사용 가능한 디자인 중 무작위' },
  ...(['default', 'quotation_line', 'quotation_bubble', 'quotation_underline', 'quotation_postit', 'quotation_corner'] as const)
    .map((value, index) => ({ value, label: `인용구 ${index + 1}${index === 0 ? ' (기본)' : ''}` })),
];

export function decorationPlacementLabel(value: DecorationPlacement): string {
  return `${value.count}회 랜덤 배치`;
}

function isHeading(text: string): boolean {
  const numbered = text.match(/^\d+[.)]\s+(.+)$/u)?.[1];
  const plainHeading = text.length <= 40 && !/[.!?。！？]/u.test(text)
    && /(?:안내|소개|방법|체크리스트|주의사항|포인트|요약|비교|정리|가격)$/u.test(text);
  return plainHeading || /^(#{1,6}\s+\S|\*\*[^*]+\*\*$|\[[^\]]+\]$)/u.test(text)
    || Boolean(numbered && numbered.length <= 50 && !/[.!?。！？]|(?:다|요|죠)$/u.test(numbered));
}

// ponytail: local text cues cannot understand every topic change. Keep the rules testable;
// semantic analysis would need separate user consent for another paid AI request.
export function resolveDecorationTargets(
  value: DecorationPlacement,
  paragraphs: readonly string[],
  random: () => number = Math.random,
): readonly DecorationTarget[] {
  if (!value.enabled || !Number.isInteger(value.count) || value.count < 1 || value.count > MAX_DECORATION_COUNT) return [];
  const candidates = getNaturalBoundaries(paragraphs);
  const selected: number[] = [];
  while (selected.length < value.count && candidates.length) {
    const priority = Math.max(...candidates.map((item) => item.priority));
    const preferred = candidates.filter((item) => item.priority === priority);
    const spaced = preferred.filter((item) => selected.every((used) => Math.abs(used - item.paragraphNumber) > 1));
    const pool = spaced.length ? spaced : preferred;
    const chosen = pool[Math.floor(random() * pool.length)]!;
    selected.push(chosen.paragraphNumber);
    candidates.splice(candidates.indexOf(chosen), 1);
  }
  return selected.sort((a, b) => a - b).map((paragraphNumber) => ({ paragraphNumber, position: 'after' }));
}

export function getNaturalBoundaries(paragraphs: readonly string[]): { paragraphNumber: number; priority: number }[] {
  const transition = /^(?:다음으로|이어서|한편|반면|이제|이번에는|그렇다면|다만|마지막으로|정리하면|요약하면|결론적으로)(?:[\s,.:]|$)/u;
  const conclusion = /^(?:정리하면|요약하면|결론적으로|마지막으로|이처럼|이상으로)(?:[\s,.:]|$)/u;
  const listItem = /^(?:[-*•]\s+|\d+[.)]\s+)/u;
  const sentenceEnd = /[.!?。！？][”’"')\]]?$/u;
  return paragraphs.flatMap((paragraph, index) => {
    const text = paragraph.trim();
    const next = paragraphs[index + 1]?.trim() ?? '';
    // Keep headings with their explanation, introductions with their list, and lists together.
    if (!text || isHeading(text) || /[:：]$/u.test(text) || (listItem.test(text) && listItem.test(next) && !isHeading(next))) return [];
    const priority = isHeading(next) || transition.test(next) || conclusion.test(text)
      ? 2 : sentenceEnd.test(text) || !next ? 1 : 0;
    return [{ paragraphNumber: index + 1, priority }];
  });
}

export function isDecorationStyleAvailable(style: string, styles: readonly { id: string }[]): boolean {
  return styles.length > 0 && (style === 'random' || styles.some((item) => item.id === style));
}

import { getNaturalBoundaries } from './post-decoration.js';

// Local formatting only: no extra AI request, no word changes, no breaks inside a keyword.
export function formatMobileParagraphs(body: string, protectedTerms: readonly string[] = []): string[] {
  const segmenter = new Intl.Segmenter('ko', { granularity: 'sentence' });
  const result: string[] = [];
  for (const line of body.replace(/\r\n?/g, '\n').split(/\n+/).map(text => text.trim()).filter(Boolean)) {
    const protectedSpans = protectedTerms.filter(Boolean).flatMap(term => {
      const spans: { start: number; end: number }[] = [];
      for (let start = line.indexOf(term); start >= 0; start = line.indexOf(term, start + term.length)) spans.push({ start, end: start + term.length });
      return spans;
    });
    const safe = (offset: number): boolean => !protectedSpans.some(span => offset > span.start && offset < span.end);
    let start = 0, sentences = 0;
    const flush = (end: number): void => {
      const text = line.slice(start, end).trim();
      if (text) result.push(text);
      start = end; sentences = 0;
    };
    for (const part of segmenter.segment(line)) {
      if (part.index > start && safe(part.index) && (sentences >= 2 || part.index + part.segment.trimEnd().length - start > 110)) flush(part.index);
      sentences += 1;
      // A very long sentence is broken only at an existing space, never inside a number/URL/word.
      while (part.index + part.segment.length - start > 140) {
        const spaces = [...line.slice(start, part.index + part.segment.length).matchAll(/\s+/g)]
          .map(match => start + match.index!).filter(offset => offset > start && offset - start <= 110 && safe(offset));
        const end = spaces.at(-1);
        if (!end) break;
        flush(end);
      }
    }
    flush(line.length);
  }
  return result;
}

export function planInlineImages(paragraphs: readonly string[], count: number): number[] {
  if (!Number.isInteger(count) || count < 1 || count > 4) return [];
  const total = paragraphs.reduce((sum, paragraph) => sum + paragraph.length, 0);
  let consumed = 0;
  const offsets = paragraphs.map(paragraph => (consumed += paragraph.length) / Math.max(1, total));
  const candidates = getNaturalBoundaries(paragraphs).filter(item => item.paragraphNumber < paragraphs.length);
  if (!candidates.length) throw new Error('이미지를 글 중간에 넣을 문단 경계가 없습니다. 본문을 확인해 주세요.');
  const selected: number[] = [];
  for (let index = 0; index < count; index += 1) {
    const available = candidates.filter(item => !selected.includes(item.paragraphNumber));
    const pool = available.length ? available : candidates;
    const target = (index + 1) / (count + 1);
    const best = [...pool].sort((a, b) =>
      (Math.abs(offsets[a.paragraphNumber - 1]! - target) - a.priority * 0.06)
      - (Math.abs(offsets[b.paragraphNumber - 1]! - target) - b.priority * 0.06))[0]!;
    selected.push(best.paragraphNumber);
  }
  return selected.sort((a, b) => a - b);
}

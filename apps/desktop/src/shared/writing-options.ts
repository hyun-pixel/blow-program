// Shared by the form and request validation to keep available lengths in sync.
export const writingTargetLengths = [700, 1_000, 1_500, 1_800, 2_000, 2_500] as const;

export function getBodyLengthGuide(targetLength: number) {
  return {
    minimumBodyLength: Math.ceil(targetLength * 0.9),
    preferredBodyLength: targetLength,
    generationMaximumBodyLength: Math.floor(targetLength * 1.07),
    maximumBodyLength: Math.floor(targetLength * 1.1),
  };
}

export function getBodyLengthReport(body: string, targetLength: number) {
  const bodyLength = [...body.replace(/\s/gu, '')].length;
  const { minimumBodyLength, maximumBodyLength } = getBodyLengthGuide(targetLength);
  const warning = bodyLength < minimumBodyLength || bodyLength > maximumBodyLength
    ? `본문이 공백 제외 ${bodyLength.toLocaleString('ko-KR')}자로, 목표 범위 ${minimumBodyLength.toLocaleString('ko-KR')}–${maximumBodyLength.toLocaleString('ko-KR')}자를 벗어났습니다.`
    : null;
  return { bodyLength, minimumBodyLength, maximumBodyLength, warning };
}

import { decorationPlacementLabel, MAX_DECORATION_COUNT, type DecorationPlacement } from './post-decoration.js';

export function DecorationPlacementFields({ id, value, onChange, disabled = false }: {
  readonly id: string;
  readonly value: DecorationPlacement;
  readonly onChange: (value: DecorationPlacement) => void;
  readonly disabled?: boolean;
}) {
  return <fieldset className="decoration-placement-fields" disabled={disabled}>
    <legend className="field-label">랜덤 배치</legend>
    <div className="field-group">
      <label htmlFor={`${id}-count`}>삽입 횟수 <span>최대 {MAX_DECORATION_COUNT}회</span></label>
      <select id={`${id}-count`} value={value.count} aria-describedby={`${id}-help`}
        onChange={(event) => onChange({ ...value, count: Number(event.target.value) })}>
        {Array.from({ length: MAX_DECORATION_COUNT }, (_, index) => index + 1).map((count) =>
          <option key={count} value={count}>{count}회</option>)}
      </select>
    </div>
    <p id={`${id}-help`} className="field-help">
      내용 전환 표현, 소제목 앞, 마무리 문단을 우선으로 위치를 무작위로 고릅니다.
      {' '}문단 중간이나 소제목 바로 뒤에는 넣지 않습니다.
      {' '}짧은 글이거나 적절한 위치가 부족하면 실제 횟수가 줄어듭니다.
    </p>
    <p className="decoration-placement-summary" role="status" aria-live="polite">{decorationPlacementLabel(value)}</p>
  </fieldset>;
}

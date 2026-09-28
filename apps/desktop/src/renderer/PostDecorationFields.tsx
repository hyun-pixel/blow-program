import { DecorationPlacementFields } from './DecorationPlacementFields.js';
import {
  dividerChoices,
  quoteChoices,
  type PostDecorations,
} from './post-decoration.js';

const sections = [
  { key: 'quote', number: '08', title: '인용구', description: '내용 전환·마무리 위치를 우선으로 인용구 디자인을 랜덤 배치합니다.' },
  { key: 'sticker', number: '09', title: '스티커', description: '내용 전환·마무리 위치를 우선으로 스티커를 랜덤 배치합니다.' },
  { key: 'divider', number: '10', title: '구분선', description: '글의 흐름을 나누는 위치를 우선으로 구분선을 랜덤 배치합니다.' },
] as const;

export function PostDecorationFields({ value, onChange }: {
  readonly value: PostDecorations;
  readonly onChange: (value: PostDecorations) => void;
}) {
  return <>{sections.map(({ key, number, title, description }) => {
    const settings = value[key];
    return (
      <section className="compose-section" aria-labelledby={`compose-${key}-heading`} key={key}>
        <header className="compose-section-heading">
          <span className="compose-section-number" aria-hidden="true">{number}</span>
          <div><h2 id={`compose-${key}-heading`}>{title}</h2><p>{description}</p></div>
          <span className="compose-section-kind">선택</span>
        </header>
        <div className="compose-section-body">
          <div className="field-group">
            <label htmlFor={`compose-${key}-enabled`}>{title} 사용 여부</label>
            <select id={`compose-${key}-enabled`} value={settings.enabled ? 'yes' : 'no'}
              onChange={(event) => onChange({ ...value, [key]: { ...settings, enabled: event.target.value === 'yes' } })}>
              <option value="no">사용 안 함</option><option value="yes">{title} 추가하기</option>
            </select>
          </div>
          {settings.enabled ? <>
            <DecorationPlacementFields id={`compose-${key}`} value={settings}
              onChange={(placement) => onChange({ ...value, [key]: { ...settings, ...placement } })} />
            {key === 'sticker' ? <div className="field-group">
              <label htmlFor="compose-sticker-category">스티커 선택 방식</label>
              <select id="compose-sticker-category" value={value.sticker.categoryMode}
                onChange={(event) => onChange({ ...value, sticker: { ...value.sticker, categoryMode: event.target.value as 'random' | 'manual' } })}>
                <option value="random">사용 가능한 묶음 중 무작위</option>
                <option value="manual">묶음 이름 직접 지정</option>
              </select>
              {value.sticker.categoryMode === 'manual' ? <>
                <label htmlFor="compose-sticker-name">스티커 묶음 이름 <span>필수</span></label>
                <input id="compose-sticker-name" maxLength={100} value={value.sticker.categoryLabel ?? ''}
                  onChange={(event) => onChange({ ...value, sticker: { ...value.sticker, categoryLabel: event.target.value } })} />
              </> : null}
              <p className="field-help">네이버에 표시되는 묶음 이름을 정확히 입력하세요. 실행 중 실제 목록에서 확인하며, 찾지 못하면 다른 묶음으로 바꾸지 않고 멈춥니다. 묶음 안의 스티커는 무작위로 고릅니다.</p>
            </div> : <div className="field-group">
              <label htmlFor={`compose-${key}-style`}>{title} 디자인</label>
              <select id={`compose-${key}-style`} value={value[key].style}
                onChange={(event) => {
                  if (key === 'divider') onChange({ ...value, divider: { ...value.divider, style: event.target.value as PostDecorations['divider']['style'] } });
                  else onChange({ ...value, quote: { ...value.quote, style: event.target.value as PostDecorations['quote']['style'] } });
                }}>
                {(key === 'divider' ? dividerChoices : quoteChoices).map((option) =>
                  <option key={option.value} value={option.value}>{option.label}</option>)}
              </select>
              <p className="field-help">번호는 기존 네이버 디자인 순서입니다. 연결 후 실제 지원 여부를 확인하며, 지원하지 않는 디자인은 임의로 바꾸지 않습니다.</p>
            </div>}
          </> : null}
          <p className="compose-section-note">실행하면 글의 흐름에 맞춰 자동으로 삽입합니다. 적절한 위치가 부족하면 가능한 횟수만 배치하고 결과에 표시합니다.</p>
        </div>
      </section>
    );
  })}</>;
}

const steps = ['네이버 연결', '글별 설정', '자동 작성·저장', '저장된 글 확인'] as const;

export function WritingSteps({ current }: { readonly current: 1 | 2 | 3 | 4 }) {
  return (
    <ol className="writing-steps" aria-label="글 작성 순서">
      {steps.map((label, index) => (
        <li key={label} className={current === index + 1 ? 'is-current' : undefined} aria-current={current === index + 1 ? 'step' : undefined}>
          <span className="writing-step-number" aria-hidden="true">{index + 1}</span>
          <span>{label}</span>
          {current === index + 1 ? <span className="writing-step-current">현재 단계</span> : null}
        </li>
      ))}
    </ol>
  );
}

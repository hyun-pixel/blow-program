import { isDecorationStyleAvailable, resolveDecorationTargets } from './post-decoration.js';
import { getSavedHistoryInput, validateWritingConfig, type WritingJob } from './writing-queue.js';
import { formatMobileParagraphs, planInlineImages } from './mobile-post-layout.js';

type Bridges = Pick<Window, 'blowNaver' | 'blowOpenAi' | 'blowWorkHistory'>;
function requireSuccess<T extends { readonly ok: boolean }>(response: T): Extract<T, { ok: true }> {
  if (!response.ok) {
    const failure = response as T & { message?: string; error?: { message: string } };
    throw new Error(failure.error?.message ?? failure.message ?? '작업 결과를 확인하지 못했습니다.');
  }
  return response as Extract<T, { ok: true }>;
}

// One job at a time. No paid retries and no final publication.
export async function runAutomaticWriting(
  job: WritingJob,
  bridges: Bridges,
  signal: AbortSignal,
  checkpoint: (job: WritingJob) => void,
): Promise<void> {
  if (job.status !== 'queued') throw new Error('대기 중인 글만 실행할 수 있습니다.');
  validateWritingConfig(job.config, job.config.request.userId);
  const { request, images, decorations, blogId } = job.config;
  let current = job;
  const check = (): void => { if (signal.aborted) throw new Error('작업을 중단했습니다. 네이버에 일부 내용이 입력됐을 수 있으니 먼저 확인하세요.'); };
  const phase = (message: string): void => {
    check();
    current = { ...current, status: 'running', message };
    checkpoint(current); // Durable checkpoint before starting a side effect.
  };
  const call = async <T extends { readonly ok: boolean }>(action: () => Promise<T>): Promise<Extract<T, { ok: true }>> => {
    check();
    const response = requireSuccess(await action());
    check();
    return response;
  };

  phase('저장할 블로그와 새 글쓰기 화면을 확인하고 있습니다.');
  const writer = await call(() => bridges.blowNaver.prepareAutomaticWriter(blogId));
  if (writer.status.stage !== 'WRITER_READY' || writer.status.registeredBlogId !== blogId) throw new Error('네이버 로그인과 저장할 블로그를 다시 확인해 주세요.');

  phase('AI가 제목과 본문을 작성하고 있습니다.');
  const generated = await call(() => bridges.blowOpenAi.generateDraft(request));
  current = { ...current, draft: generated.draft, warnings: generated.verification.warnings ?? [] };
  phase('글자 수와 키워드 등 작성 조건을 자동으로 검사하고 있습니다.');
  if (!generated.verification.valid) throw new Error(`자동 검사에서 멈췄습니다: ${generated.verification.issues.join(' ')} 추가 비용이 드는 재생성은 자동으로 하지 않습니다.`);
  const paragraphs = formatMobileParagraphs(generated.draft.body, request.keywords.map(keyword => keyword.value));
  if (!paragraphs.length) throw new Error('생성된 본문이 비어 있습니다.');
  current = { ...current, draft: { ...generated.draft, body: paragraphs.join('\n\n') } };
  const imagePositions = images.enabled ? planInlineImages(paragraphs, images.count) : [];
  const targets = {
    quote: resolveDecorationTargets(decorations.quote, paragraphs),
    sticker: resolveDecorationTargets(decorations.sticker, paragraphs),
    divider: resolveDecorationTargets(decorations.divider, paragraphs),
  };
  for (const kind of ['quote', 'sticker', 'divider'] as const) {
    if (decorations[kind].enabled && !targets[kind].length) throw new Error('내용 전환·마무리 위치를 찾지 못해 꾸미기를 중단했습니다.');
  }
  let dataUrls: string[] = [];
  if (images.enabled) {
    phase(`이미지 ${images.count}장을 만들고 있습니다.`);
    const response = await call(() => bridges.blowOpenAi.generateImages({
      userId: request.userId, topic: request.topic, articleTitle: generated.draft.title, articleBody: generated.draft.body,
      count: images.count, aspectRatio: images.aspectRatio, qualityMode: images.qualityMode, style: images.style,
    }));
    if (response.images.length !== images.count) throw new Error('요청한 이미지 장수와 생성 결과가 다릅니다. 임시저장은 진행하지 않았습니다.');
    dataUrls = response.images.map(({ dataUrl }) => dataUrl);
  }
  phase('네이버에 제목과 본문을 입력하고 있습니다.');
  await call(() => bridges.blowNaver.enterContent({ title: generated.draft.title, paragraphs }));
  if (dataUrls.length) {
    phase('생성 이미지를 본문 중간의 전환 지점에 나누어 넣고 있습니다.');
    const prepared = await call(() => bridges.blowNaver.prepareGeneratedImages(dataUrls));
    if (prepared.canceled || prepared.files.length !== dataUrls.length) throw new Error('이미지 준비를 완료하지 못했습니다.');
    const attached = await call(() => bridges.blowNaver.attachImages(prepared.files.map(({ id }) => id), 'individual', imagePositions));
    if (attached.result.insertedCount !== dataUrls.length) throw new Error('일부 이미지가 누락되어 저장을 중단했습니다.');
  }
  for (const kind of ['quote', 'sticker', 'divider'] as const) {
    const plan = targets[kind];
    const first = plan[0];
    if (!first) continue;
    const label = { quote: '인용구', sticker: '스티커', divider: '구분선' }[kind];
    phase(`${label} 디자인과 사용 가능 여부를 확인하고 있습니다.`);
    let categoryId = '';
    if (kind === 'sticker') {
      const response = await call(() => bridges.blowNaver.listStickerCategories(first.paragraphNumber, first.position));
      const categories = response.result.categories;
      const matches = categories.filter(({ label }) => label.trim() === decorations.sticker.categoryLabel?.trim());
      const category = decorations.sticker.categoryMode === 'random'
        ? categories[Math.floor(Math.random() * categories.length)] : matches.length === 1 ? matches[0] : undefined;
      if (!category) throw new Error('선택한 스티커 묶음을 확인할 수 없습니다. 임의의 다른 묶음으로 바꾸지 않았습니다.');
      categoryId = category.id;
    } else {
      const response = kind === 'quote'
        ? await call(() => bridges.blowNaver.listQuoteStyles(first.paragraphNumber, first.position))
        : await call(() => bridges.blowNaver.listDividerStyles(first.paragraphNumber, first.position));
      if (!isDecorationStyleAvailable(decorations[kind].style, response.result.styles)) throw new Error(`선택한 ${label} 디자인을 현재 사용할 수 없습니다.`);
    }
    for (const [index, target] of plan.entries()) {
      phase(`${label} ${index + 1}/${plan.length}회 배치 중입니다.`);
      if (kind === 'quote') await call(() => bridges.blowNaver.insertQuote(target.paragraphNumber, target.position, decorations.quote.style));
      else if (kind === 'divider') await call(() => bridges.blowNaver.insertDivider(target.paragraphNumber, target.position, decorations.divider.style));
      else await call(() => bridges.blowNaver.insertRandomSticker(target.paragraphNumber, target.position, categoryId));
    }
  }
  phase('네이버 임시저장을 실행하고 저장 결과를 확인하고 있습니다.');
  // A successful save remains saved even if Stop was pressed while it was in flight.
  check();
  const saved = requireSuccess(await bridges.blowNaver.saveDraft());
  if (saved.result.stage !== 'DRAFT_SAVE_COMPLETED') throw new Error('네이버 임시저장 완료 결과가 없어 작업 내역에 기록하지 않았습니다.');
  const counts = `이미지 ${dataUrls.length}장 · 인용구 ${targets.quote.length}회 · 스티커 ${targets.sticker.length}회 · 구분선 ${targets.divider.length}회`;
  current = { ...current, status: 'saved', savedUrl: saved.result.currentUrl, historyPending: true, message: `네이버 임시저장 완료. ${counts}. 발행하지 않았습니다.${current.warnings?.length ? ' 작성 결과 안내를 확인해 주세요.' : ''}` };
  let checkpointWarning = '';
  try { checkpoint(current); } catch { checkpointWarning = '네이버 저장은 완료됐지만 작성 목록의 진행 상태를 보관하지 못했습니다.'; }
  let historyWarning = '';
  try {
    requireSuccess(await bridges.blowWorkHistory.add(request.userId, getSavedHistoryInput(current)));
    current = { ...current, historyPending: false };
  } catch { historyWarning = ' 네이버 저장은 완료됐지만 BLOW 작업 내역을 기록하지 못했습니다. ‘작업 내역 다시 기록’을 누르면 글 재생성 없이 기록만 복구합니다.'; }
  try { checkpoint({ ...current, message: current.message + historyWarning }); }
  catch { checkpointWarning = '네이버 저장은 완료됐지만 작성 목록의 진행 상태를 보관하지 못했습니다.'; }
  if (historyWarning || checkpointWarning) throw new Error(historyWarning || checkpointWarning);
}

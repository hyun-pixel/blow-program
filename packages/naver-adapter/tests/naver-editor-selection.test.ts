import type { Locator, Page } from 'playwright-core';
import { describe, expect, it, vi } from 'vitest';

import {
  placeCaretAtParagraphEdge,
  type NaverParagraphEdge,
} from '../src/naver-editor-selection.js';

function createSelectionHarness(
  textValues: readonly string[],
  selectionMatches = true,
): {
  readonly page: Page;
  readonly anchor: Locator;
  readonly textNodes: readonly { textContent: string }[];
  readonly rangeStart: { node: unknown; offset: number };
  readonly keyboardPress: ReturnType<typeof vi.fn>;
} {
  const textNodes = textValues.map((textContent) => ({ textContent }));
  const rangeStart: { node: unknown; offset: number } = {
    node: null,
    offset: -1,
  };
  const range = {
    setStart: vi.fn((node: unknown, offset: number) => {
      rangeStart.node = node;
      rangeStart.offset = offset;
    }),
    collapse: vi.fn(),
    selectNodeContents: vi.fn(),
  };
  const selection = {
    isCollapsed: true,
    anchorNode: null as unknown,
    anchorOffset: -1,
    removeAllRanges: vi.fn(),
    addRange: vi.fn(() => {
      selection.anchorNode = selectionMatches ? rangeStart.node : null;
      selection.anchorOffset = selectionMatches ? rangeStart.offset : -1;
    }),
  };
  const editorWindow = {
    getSelection: vi.fn(() => selection),
    Event: class {
      constructor(
        readonly type: string,
        readonly options: { readonly bubbles: boolean },
      ) {}
    },
  };
  const document = {
    defaultView: editorWindow,
    createTreeWalker: vi.fn(() => {
      let walkerIndex = 0;

      return {
        nextNode: vi.fn(() => textNodes[walkerIndex++] ?? null),
      };
    }),
    createRange: vi.fn(() => range),
    dispatchEvent: vi.fn(),
  };
  const element = {
    ownerDocument: document,
    childNodes: textNodes,
    closest: vi.fn(() => ({ focus: vi.fn() })),
  };
  const anchor = {
    boundingBox: vi.fn().mockResolvedValue({
      x: 0,
      y: 0,
      width: 200,
      height: 40,
    }),
    click: vi.fn().mockResolvedValue(undefined),
    evaluate: vi.fn(async (
      callback: (target: unknown, edge: NaverParagraphEdge) => boolean,
      edge: NaverParagraphEdge,
    ) => callback(element, edge)),
  } as unknown as Locator;
  const keyboardPress = vi.fn(async (key: string) => {
    const visibleNodes = textNodes.filter(
      (node) => node.textContent.replace(/[\s\u200b\ufeff]/g, '').length > 0,
    );
    const targetNode = key === 'Home'
      ? visibleNodes[0]
      : visibleNodes.at(-1);
    selection.anchorNode = targetNode ?? null;
    selection.anchorOffset = key === 'Home'
      ? 0
      : (targetNode?.textContent.length ?? 0);
  });
  const page = {
    keyboard: { press: keyboardPress },
  } as unknown as Page;

  return { page, anchor, textNodes, rangeStart, keyboardPress };
}

describe('네이버 문단 커서 경계 지정', () => {
  it('문단 앞은 보이지 않는 노드를 건너뛰고 첫 글자의 시작에 둔다', async () => {
    const harness = createSelectionHarness(['\u200b', '첫 문장', '\ufeff']);

    await placeCaretAtParagraphEdge(harness.page, harness.anchor, 'before');

    expect(harness.rangeStart).toEqual({
      node: harness.textNodes[1],
      offset: 0,
    });
    expect(harness.anchor.click).toHaveBeenCalledWith({
      position: { x: 2, y: 2 },
    });
    expect(harness.keyboardPress).toHaveBeenCalledOnce();
    expect(harness.keyboardPress).toHaveBeenCalledWith('Home');
  });

  it('문단 뒤도 왼쪽에서 활성화한 뒤 마지막 글자로 이동해 오른쪽 패널을 피한다', async () => {
    const harness = createSelectionHarness(['\u200b', '첫 ', '문장', '  ']);

    await placeCaretAtParagraphEdge(harness.page, harness.anchor, 'after');

    expect(harness.rangeStart).toEqual({
      node: harness.textNodes[2],
      offset: 2,
    });
    expect(harness.anchor.click).toHaveBeenCalledWith({
      position: { x: 2, y: 2 },
    });
    expect(harness.keyboardPress).toHaveBeenCalledOnce();
    expect(harness.keyboardPress).toHaveBeenCalledWith('End');
  });

  it('지정한 경계에 커서가 적용되지 않으면 삽입 전에 중단한다', async () => {
    const harness = createSelectionHarness(['문장'], false);

    await expect(
      placeCaretAtParagraphEdge(harness.page, harness.anchor, 'before'),
    ).rejects.toThrow('EDITOR_SELECTION_EDGE_MISMATCH');
    expect(harness.keyboardPress).not.toHaveBeenCalled();
  });
});

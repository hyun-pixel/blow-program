import type { Locator, Page } from 'playwright-core';

export type NaverParagraphEdge = 'before' | 'after';

export async function placeCaretAtParagraphEdge(
  page: Page,
  anchor: Locator,
  edge: NaverParagraphEdge,
): Promise<void> {
  const bounds = await anchor.boundingBox();

  if (bounds) {
    const horizontalInset = Math.min(2, bounds.width / 2);
    const verticalInset = Math.min(2, bounds.height / 2);
    await anchor.click({
      position: {
        x: edge === 'before'
          ? horizontalInset
          : Math.max(horizontalInset, bounds.width - horizontalInset),
        y: edge === 'before'
          ? verticalInset
          : Math.max(verticalInset, bounds.height - verticalInset),
      },
    });
  } else {
    await anchor.click();
  }

  const selectionApplied = await anchor.evaluate((element, targetEdge) => {
    const editorWindow = element.ownerDocument.defaultView;
    const selection = editorWindow?.getSelection();
    const editable = element.closest('[contenteditable]') as
      | HTMLElement
      | null;

    if (!editorWindow || !selection) {
      throw new Error('EDITOR_SELECTION_NOT_AVAILABLE');
    }

    const walker = element.ownerDocument.createTreeWalker(element, 4);
    let firstTextNode: Node | null = null;
    let lastTextNode: Node | null = null;
    let currentNode = walker.nextNode();

    while (currentNode) {
      const visibleText = (currentNode.textContent ?? '')
        .replace(/[\s\u200b\ufeff]/g, '');

      if (visibleText.length > 0) {
        firstTextNode ??= currentNode;
        lastTextNode = currentNode;
      }

      currentNode = walker.nextNode();
    }

    const targetNode = targetEdge === 'before' ? firstTextNode : lastTextNode;
    const range = element.ownerDocument.createRange();
    let expectedNode: Node = element;
    let expectedOffset = targetEdge === 'before' ? 0 : element.childNodes.length;

    if (targetNode) {
      expectedNode = targetNode;
      expectedOffset = targetEdge === 'before'
        ? 0
        : (targetNode.textContent ?? '').length;
      range.setStart(targetNode, expectedOffset);
      range.collapse(true);
    } else {
      range.selectNodeContents(element);
      range.collapse(targetEdge === 'before');
    }

    (editable ?? (element as HTMLElement)).focus?.();
    selection.removeAllRanges();
    selection.addRange(range);
    element.ownerDocument.dispatchEvent(
      new editorWindow.Event('selectionchange', { bubbles: true }),
    );

    return selection.isCollapsed &&
      selection.anchorNode === expectedNode &&
      selection.anchorOffset === expectedOffset;
  }, edge);

  if (!selectionApplied) {
    throw new Error('EDITOR_SELECTION_EDGE_MISMATCH');
  }

  await page.keyboard.press(edge === 'before' ? 'Home' : 'End');
  const trustedSelectionApplied = await anchor.evaluate(
    (element, targetEdge) => {
      const selection = element.ownerDocument.defaultView?.getSelection();

      if (!selection || !selection.isCollapsed) {
        return false;
      }

      const walker = element.ownerDocument.createTreeWalker(element, 4);
      let firstTextNode: Node | null = null;
      let lastTextNode: Node | null = null;
      let currentNode = walker.nextNode();

      while (currentNode) {
        const visibleText = (currentNode.textContent ?? '')
          .replace(/[\s\u200b\ufeff]/g, '');

        if (visibleText.length > 0) {
          firstTextNode ??= currentNode;
          lastTextNode = currentNode;
        }

        currentNode = walker.nextNode();
      }

      const expectedNode = targetEdge === 'before'
        ? firstTextNode
        : lastTextNode;
      const expectedOffset = targetEdge === 'before'
        ? 0
        : (expectedNode?.textContent ?? '').length;

      return selection.anchorNode === expectedNode &&
        selection.anchorOffset === expectedOffset;
    },
    edge,
  );

  if (!trustedSelectionApplied) {
    throw new Error('EDITOR_TRUSTED_SELECTION_EDGE_MISMATCH');
  }
}
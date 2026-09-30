import type { BrowserWindow } from 'electron';

type AutomationWindow = Pick<BrowserWindow, 'isDestroyed' | 'isMinimized' | 'isFocused' | 'focus'>;

// Chrome can activate itself while a new writer loads. Reclaim focus once before
// arming the existing blur/abort guard, never during typing or an insertion.
export async function prepareAutomationFocus(window: AutomationWindow | null): Promise<boolean> {
  if (!window) return false;
  try {
    if (window.isDestroyed() || window.isMinimized()) return false;
    if (!window.isFocused()) window.focus();
    const deadline = Date.now() + 2_000;
    let focusedSince: number | null = null;
    while (Date.now() <= deadline) {
      if (window.isDestroyed() || window.isMinimized()) return false;
      if (window.isFocused()) {
        focusedSince ??= Date.now();
        if (Date.now() - focusedSince >= 200) return true;
      } else {
        focusedSince = null;
      }
      await new Promise(resolve => setTimeout(resolve, 50));
    }
  } catch {
    // Closed windows or a refused focus change must not permit browser input.
  }
  return false;
}

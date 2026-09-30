import { type ReactNode, useEffect, useId, useRef } from 'react';

// Keep confirmations inside the renderer: native window.confirm can lose input focus on Windows.
export function ConfirmationDialog({ open, title, children, confirmLabel, onConfirm, onCancel, fallbackFocusId = 'main-content' }: {
  readonly open: boolean;
  readonly title: string;
  readonly children: ReactNode;
  readonly confirmLabel: string;
  readonly onConfirm: () => void;
  readonly onCancel: () => void;
  readonly fallbackFocusId?: string;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const id = useId();
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!open || !dialog) return;
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    dialog.showModal();
    return () => {
      dialog.close();
      // The trigger may have been deleted, disabled by an async job, or hidden by navigation.
      const target = previous?.isConnected && !previous.matches(':disabled') && !previous.closest('[hidden]')
        ? previous : document.getElementById(fallbackFocusId);
      target?.focus({ preventScroll: true });
    };
  }, [open, fallbackFocusId]);
  const finish = (action: () => void): void => {
    if (!dialogRef.current?.open) return;
    dialogRef.current.close();
    action();
  };
  return (
    <dialog ref={dialogRef} className="queue-confirmation" aria-labelledby={`${id}-title`} aria-describedby={`${id}-description`}
      onCancel={(event) => { event.preventDefault(); finish(onCancel); }}>
      <h2 id={`${id}-title`}>{title}</h2>
      <div id={`${id}-description`}>{children}</div>
      <div className="queue-actions">
        <button className="button secondary" type="button" autoFocus onClick={() => finish(onCancel)}>취소</button>
        <button className="button primary" type="button" onClick={() => finish(onConfirm)}>{confirmLabel}</button>
      </div>
    </dialog>
  );
}

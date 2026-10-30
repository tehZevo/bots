import { useEffect } from "react";

export function ConfirmDialog({
  text,
  confirmLabel,
  cancelLabel = "Cancel",
  onCancel,
  onConfirm,
}: {
  text: string;
  confirmLabel: string;
  cancelLabel?: string;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCancel();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onCancel]);

  return (
    <div className="confirm">
      <button
        type="button"
        className="mscrim"
        aria-label="Cancel"
        onClick={onCancel}
      />
      <div className="dialog narrow" role="alertdialog" aria-label={text}>
        <p>{text}</p>
        <div className="actions">
          <button type="button" className="danger" onClick={onConfirm}>
            {confirmLabel}
          </button>
          <button type="button" onClick={onCancel}>
            {cancelLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

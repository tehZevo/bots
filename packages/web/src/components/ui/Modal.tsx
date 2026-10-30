import type { FormHTMLAttributes, HTMLAttributes, ReactNode } from "react";

interface ChromeProps {
  scrimOnCancel: () => void;
  scrimLabel?: string;
  children: ReactNode;
}

export function Modal({
  scrimOnCancel,
  scrimLabel = "Cancel",
  children,
  ...dialog
}: ChromeProps & HTMLAttributes<HTMLDivElement>) {
  return (
    <div className="modal">
      <button
        type="button"
        className="mscrim"
        aria-label={scrimLabel}
        onClick={scrimOnCancel}
      />
      <div {...dialog}>{children}</div>
    </div>
  );
}

export function ModalForm({
  scrimOnCancel,
  scrimLabel = "Cancel",
  children,
  ...form
}: ChromeProps & FormHTMLAttributes<HTMLFormElement>) {
  return (
    <div className="modal">
      <button
        type="button"
        className="mscrim"
        aria-label={scrimLabel}
        onClick={scrimOnCancel}
      />
      <form {...form}>{children}</form>
    </div>
  );
}

import { type RefObject, useEffect } from "react";

/**
 * Calls `onClose` while `open` whenever focus or a pointer press lands outside
 * `ref` — dropdowns that would otherwise stay open after you click away.
 */
export function useDismissOnFocusLost(
  ref: RefObject<HTMLElement | null>,
  open: boolean,
  onClose: () => void,
): void {
  useEffect(() => {
    if (!open) return;
    const el = ref.current;
    if (!el) return;
    const onPointerDown = (e: PointerEvent) => {
      if (!el.contains(e.target as Node)) onClose();
    };
    const onFocusOut = (e: FocusEvent) => {
      const next = e.relatedTarget as Node | null;
      if (!next || !el.contains(next)) onClose();
    };
    document.addEventListener("pointerdown", onPointerDown, true);
    document.addEventListener("focusout", onFocusOut);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown, true);
      document.removeEventListener("focusout", onFocusOut);
    };
  }, [ref, open, onClose]);
}

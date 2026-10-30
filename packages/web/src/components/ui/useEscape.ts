import { useEffect } from "react";

// Escape-to-cancel shared by dialogs; `onEscape` is re-bound whenever it changes.
export function useEscape(onEscape: () => void, enabled = true): void {
  useEffect(() => {
    if (!enabled) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onEscape();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onEscape, enabled]);
}

import { useState } from "react";
import { titleCase } from "../../lib/format.ts";
import type { Theme } from "../../theme.ts";
import { readStoredTheme, setStoredTheme } from "../../theme.ts";

export const THEMES: readonly Theme[] = ["light", "dark", "system"];

export function ThemeSection() {
  const [theme, setTheme] = useState<Theme>(readStoredTheme);
  const pickTheme = (t: Theme) => {
    setStoredTheme(t);
    setTheme(t);
  };

  return (
    <>
      <p className="muted">Theme</p>
      <div className="themegroup" role="group" aria-label="Theme">
        {THEMES.map((t) => (
          <button
            key={t}
            type="button"
            className={t === theme ? "sel" : ""}
            onClick={() => pickTheme(t)}
          >
            {titleCase(t)}
          </button>
        ))}
      </div>
    </>
  );
}

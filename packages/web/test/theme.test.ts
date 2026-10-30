import assert from "node:assert/strict";
import { it as test } from "vitest";

const store = new Map<string, string>();
const darkMatches = true;
const listeners = new Set<() => void>();

Object.assign(globalThis, {
  localStorage: {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
  },
  document: { documentElement: { dataset: {} as Record<string, string> } },
  window: {
    matchMedia: () => ({
      get matches() {
        return darkMatches;
      },
      addEventListener: (_t: string, f: () => void) => listeners.add(f),
      removeEventListener: (_t: string, f: () => void) => listeners.delete(f),
    }),
  },
});

const theme = await import("../src/theme.ts");

test("stored theme defaults to dark and explicit themes pass through", () => {
  assert.equal(theme.readStoredTheme(), "dark");
  assert.equal(theme.resolveTheme("light"), "light");
  assert.equal(theme.resolveTheme("dark"), "dark");
});

test("system resolves through the prefers-dark matcher", () => {
  store.set("bots-theme", "system");
  theme.setPrefersDarkMatcher(() => true);
  theme.applyTheme();
  assert.equal(
    (
      globalThis.document as {
        documentElement: { dataset: Record<string, string> };
      }
    ).documentElement.dataset.theme,
    "dark",
  );
  theme.setPrefersDarkMatcher(() => false);
  theme.applyTheme();
  assert.equal(
    (
      globalThis.document as {
        documentElement: { dataset: Record<string, string> };
      }
    ).documentElement.dataset.theme,
    "light",
  );
});

test("setStoredTheme persists the choice and applies the resolved value", () => {
  theme.setPrefersDarkMatcher(() => false);
  theme.setStoredTheme("system");
  assert.equal(store.get("bots-theme"), "system");
  assert.equal(
    (
      globalThis.document as {
        documentElement: { dataset: Record<string, string> };
      }
    ).documentElement.dataset.theme,
    "light",
  );
});

test("watchSystemTheme re-applies on OS changes while attached", () => {
  store.set("bots-theme", "system");
  theme.setPrefersDarkMatcher(() => true);
  theme.applyTheme();
  const off = theme.watchSystemTheme();
  assert.equal(listeners.size, 1);
  theme.setPrefersDarkMatcher(() => false);
  for (const f of [...listeners]) f();
  assert.equal(
    (
      globalThis.document as {
        documentElement: { dataset: Record<string, string> };
      }
    ).documentElement.dataset.theme,
    "light",
  );
  off();
  assert.equal(listeners.size, 0);
});

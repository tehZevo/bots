export type Theme = "light" | "dark" | "system";

const KEY = "bots-theme";
let prefersDark: () => boolean = () =>
  typeof window.matchMedia === "function"
    ? window.matchMedia("(prefers-color-scheme: dark)").matches
    : true;

export function setPrefersDarkMatcher(fn: () => boolean): void {
  prefersDark = fn;
}

export function readStoredTheme(): Theme {
  const stored = localStorage.getItem(KEY);
  return stored === "light" || stored === "system" ? stored : "dark";
}

export function resolveTheme(t: Theme): "light" | "dark" {
  if (t !== "system") return t;
  return prefersDark() ? "dark" : "light";
}

export function applyTheme(): void {
  document.documentElement.dataset.theme = resolveTheme(readStoredTheme());
}

export function setStoredTheme(t: Theme): void {
  localStorage.setItem(KEY, t);
  applyTheme();
}

export function watchSystemTheme(): () => void {
  if (typeof window.matchMedia !== "function") return () => undefined;
  const mq = window.matchMedia("(prefers-color-scheme: dark)");
  const onChange = () => applyTheme();
  mq.addEventListener("change", onChange);
  return () => mq.removeEventListener("change", onChange);
}

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
  const resolved = resolveTheme(readStoredTheme());
  document.documentElement.dataset.theme = resolved;
  let canvas = "";
  if (typeof getComputedStyle === "function") {
    canvas = getComputedStyle(document.documentElement).getPropertyValue(
      "--bg",
    );
  }
  if (typeof document.querySelector !== "function") return;
  const meta = document.querySelector('meta[name="theme-color"]');
  if (!meta) return;
  meta.setAttribute(
    "content",
    canvas.trim() || (resolved === "light" ? "#eef1f5" : "#0f141a"),
  );
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

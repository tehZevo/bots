export function relTime(ts: number): string {
  const s = Math.max(0, Math.floor((Date.now() - ts) / 1000));
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

export function fmt(ts: number | null): string {
  return ts ? new Date(ts).toLocaleString() : "—";
}

export function fmtTokens(n: number): string {
  if (n >= 1e9) return `${(n / 1e9).toFixed(1)}B`;
  if (n >= 1e6) return `${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(1)}k`;
  return String(n);
}

export function fmtMs(ms: number): string {
  if (ms < 1000) return `${Math.round(ms)}ms`;
  const s = ms / 1000;
  return s < 60
    ? `${s.toFixed(1)}s`
    : `${Math.floor(s / 60)}m ${Math.round(s % 60)}s`;
}

export function titleCase(value: string): string {
  if (!value) return value;
  return value[0].toUpperCase() + value.slice(1);
}

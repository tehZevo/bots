export function BotIcon({ size = 18 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      aria-hidden
    >
      <rect x="5" y="8" width="14" height="11" rx="2.5" />
      <line x1="12" y1="4.5" x2="12" y2="8" />
      <circle cx="12" cy="3.6" r="1.1" fill="currentColor" stroke="none" />
      <circle cx="9.2" cy="13" r="1.05" fill="currentColor" stroke="none" />
      <circle cx="14.8" cy="13" r="1.05" fill="currentColor" stroke="none" />
      <line x1="9.5" y1="16.3" x2="14.5" y2="16.3" />
    </svg>
  );
}

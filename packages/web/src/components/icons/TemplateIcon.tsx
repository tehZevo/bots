export function TemplateIcon({ size = 18 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <rect x="8" y="3" width="13" height="7" rx="1.5" />
      <rect x="8" y="14" width="13" height="7" rx="1.5" />
      <path d="M3 6v12" />
    </svg>
  );
}

export function PauseIcon({ size = 16 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
    >
      <rect x="7" y="5.5" width="3.5" height="13" rx="1.2" />
      <rect x="13.5" y="5.5" width="3.5" height="13" rx="1.2" />
    </svg>
  );
}

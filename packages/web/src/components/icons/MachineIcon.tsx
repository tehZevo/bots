export function MachineIcon({ size = 18 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <rect x="3.5" y="4" width="17" height="7" rx="2" />
      <rect x="3.5" y="13" width="17" height="7" rx="2" />
      <circle cx="7.2" cy="7.5" r="0.9" fill="currentColor" stroke="none" />
      <circle cx="7.2" cy="16.5" r="0.9" fill="currentColor" stroke="none" />
    </svg>
  );
}

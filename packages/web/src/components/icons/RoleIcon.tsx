export function RoleIcon({ size = 18 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M12 3l7 3v5.2c0 4.4-3 7.9-7 9.3-4-1.4-7-4.9-7-9.3V6l7-3z" />
      <circle cx="12" cy="10.2" r="2.1" />
      <path
        d="M8.5 16.6c.8-1.7 2-2.5 3.5-2.5s2.7.8 3.5 2.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

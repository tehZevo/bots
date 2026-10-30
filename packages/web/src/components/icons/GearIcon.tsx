export function GearIcon({ size = 18 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M10.34 4.79 L9.71 2.06 L14.29 2.06 L13.66 4.79 L15.92 5.72 L17.41 3.35 L20.65 6.59 L18.28 8.08 L19.21 10.34 L21.94 9.71 L21.94 14.29 L19.21 13.66 L18.28 15.92 L20.65 17.41 L17.41 20.65 L15.92 18.28 L13.66 19.21 L14.29 21.94 L9.71 21.94 L10.34 19.21 L8.08 18.28 L6.59 20.65 L3.35 17.41 L5.72 15.92 L4.79 13.66 L2.06 14.29 L2.06 9.71 L4.79 10.34 L5.72 8.08 L3.35 6.59 L6.59 3.35 L8.08 5.72 Z" />
      <circle cx="12" cy="12" r="3.1" />
    </svg>
  );
}

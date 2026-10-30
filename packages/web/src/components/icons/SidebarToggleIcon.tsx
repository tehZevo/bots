export function SidebarToggleIcon({
  size = 20,
  collapsed,
}: {
  size?: number;
  collapsed: boolean;
}) {
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
      aria-hidden="true"
    >
      <rect x="3" y="4" width="18" height="16" rx="2.5" />
      <path d="M9 4v16" />
      {collapsed ? (
        <path d="m14.5 9.5 3 2.5-3 2.5" />
      ) : (
        <path d="m17.5 9.5-3 2.5 3 2.5" />
      )}
    </svg>
  );
}

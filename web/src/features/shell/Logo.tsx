export function Logo({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 512 512" className={className} aria-hidden>
      <rect width="512" height="512" rx="112" fill="#0b0d0a" />
      <path d="M256 84 384 212h-78v96h-100v-96h-78z" fill="#c6ff3d" />
      <rect x="72" y="358" width="368" height="24" rx="12" fill="#c6ff3d" />
      <rect x="104" y="318" width="40" height="104" rx="12" fill="#c6ff3d" />
      <rect x="368" y="318" width="40" height="104" rx="12" fill="#c6ff3d" />
      <rect x="152" y="334" width="24" height="72" rx="9" fill="#c6ff3d" />
      <rect x="336" y="334" width="24" height="72" rx="9" fill="#c6ff3d" />
    </svg>
  );
}

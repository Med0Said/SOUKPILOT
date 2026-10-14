/**
 * SoukPilot mark: a Tunisian horseshoe-arch door (Sidi Bou Saïd) in a rounded
 * tile, with a terracotta stud. Presentation attributes only (no inline
 * `style`), so it renders under the strict CSP.
 */
export function LogoMark({ size = 28, className = "" }: { size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      aria-hidden="true"
      focusable="false"
      className={className}
    >
      <rect width="32" height="32" rx="8" className="fill-primary" />
      <path
        d="M10 25V15.5a6 6 0 0 1 12 0V25"
        fill="none"
        className="stroke-primary-foreground"
        strokeWidth="2.6"
        strokeLinecap="round"
      />
      <path d="M13.5 25v-6.5a2.5 2.5 0 0 1 5 0V25" fill="none" className="stroke-primary-foreground" strokeWidth="1.6" opacity="0.55" />
      <circle cx="16" cy="7.4" r="1.9" className="fill-accent" />
    </svg>
  );
}

export function Logo({ compact = false }: { compact?: boolean }) {
  return (
    <span className="inline-flex items-center gap-2">
      <LogoMark />
      {compact ? (
        <span className="sr-only">SoukPilot</span>
      ) : (
        <span className="text-lg tracking-tight">
          <span className="font-medium text-foreground">Souk</span>
          <span className="font-semibold text-primary">Pilot</span>
        </span>
      )}
    </span>
  );
}

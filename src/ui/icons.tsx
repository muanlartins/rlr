/** The player's icons: 16 × 16, drawn in the current colour. */
const Icon = ({ children, className = "h-4 w-4" }: { children: React.ReactNode; className?: string }) => (
  <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden>
    {children}
  </svg>
)

/** The free camera: an orbit round a point. */
export const OrbitIcon = () => (
  <Icon>
    <ellipse cx="8" cy="8" rx="6.5" ry="3" />
    <circle cx="8" cy="8" r="1.5" fill="currentColor" stroke="none" />
  </Icon>
)

/** Straight down on the pitch. */
export const OverheadIcon = () => (
  <Icon>
    <rect x="2" y="3.5" width="12" height="9" rx="1" />
    <path d="M8 3.5v9" />
    <circle cx="8" cy="8" r="1.75" />
  </Icon>
)

export const PenIcon = () => (
  <Icon>
    <path d="M10.5 2.5l3 3-8 8H2.5v-3z" />
  </Icon>
)

export const ArrowIcon = () => (
  <Icon>
    <path d="M3 13L13 3M7 3h6v6" />
  </Icon>
)

export const CircleIcon = () => (
  <Icon>
    <circle cx="8" cy="8" r="5.5" />
  </Icon>
)

export const ClearIcon = () => (
  <Icon>
    <path d="M3 4.5h10M6.5 4.5V3h3v1.5M4.5 4.5l.75 9h5.5l.75-9" />
  </Icon>
)

/** The tactics board. */
export const BoardIcon = () => (
  <Icon>
    <rect x="2" y="2.5" width="12" height="11" rx="1.5" />
    <path d="M5 6l2 2M7 6L5 8M10 10.5a1.5 1.5 0 100-.01M6.5 11c1.5-2 3-3.5 4-5" />
  </Icon>
)

/** The studio: the stream's recording. */
export const StudioIcon = () => (
  <Icon>
    <rect x="1.5" y="4" width="9" height="8" rx="1.5" />
    <path d="M10.5 7l4-2v6l-4-2" />
  </Icon>
)

export const FullScreenIcon = () => (
  <Icon>
    <path d="M2.5 6V2.5H6M10 2.5h3.5V6M13.5 10v3.5H10M6 13.5H2.5V10" />
  </Icon>
)

/** A gamepad: playing on from a moment. */
export const PadIcon = ({ className }: { className?: string }) => (
  <Icon className={className}>
    <path d="M4.5 4.5h7a3 3 0 012.9 3.7l-.9 3.6a1.6 1.6 0 01-2.7.7L9 10.5H7l-1.8 2a1.6 1.6 0 01-2.7-.7l-.9-3.6a3 3 0 012.9-3.7z" />
    <path d="M5 7v2M4 8h2" />
    <circle cx="10.5" cy="7.5" r=".6" fill="currentColor" stroke="none" />
    <circle cx="11.75" cy="8.75" r=".6" fill="currentColor" stroke="none" />
  </Icon>
)

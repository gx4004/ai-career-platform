import type { CSSProperties, ReactNode } from 'react'
import type { LucideIcon } from 'lucide-react'

/**
 * Hero for workspace pages (Applications first; CV Studio, Profile and
 * Discovery adopt it in their own redesigns). It is the tool input hero — same
 * `tool-input-hero` classes, grain, glow, centred title, chips and rising
 * text — with the tool illustration swapped for the page's icon and the
 * page's one primary action underneath. No stat tiles: counts belong in
 * compact chips or in the page body.
 */
export function PageHero({
  icon: Icon,
  title,
  purpose,
  action,
  chips,
  accent,
}: {
  icon?: LucideIcon
  title: ReactNode
  /** One line saying what the page is for. */
  purpose: ReactNode
  /** The page's primary action (usually a single Button). */
  action?: ReactNode
  /** Optional short facts, e.g. "3 in progress". */
  chips?: string[]
  accent?: string
}) {
  return (
    <header
      className="tool-input-hero page-hero"
      style={accent ? ({ '--tool-accent': accent } as CSSProperties) : undefined}
    >
      {Icon ? (
        <div className="tool-input-hero-illust">
          <span className="tool-illust-wrap page-hero__icon" aria-hidden="true">
            <Icon size={34} strokeWidth={1.7} />
          </span>
        </div>
      ) : null}
      <h1 className="tool-input-hero-title">{title}</h1>
      <p className="tool-input-hero-subtitle">{purpose}</p>
      {chips && chips.length > 0 ? (
        <ul className="tool-input-hero-chips page-hero__chips">
          {chips.map((chip) => (
            <li key={chip} className="tool-input-hero-chip">
              {chip}
            </li>
          ))}
        </ul>
      ) : null}
      {action ? <div className="page-hero__action">{action}</div> : null}
    </header>
  )
}

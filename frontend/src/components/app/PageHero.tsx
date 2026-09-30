import type { ReactNode } from 'react'
import type { LucideIcon } from 'lucide-react'

/**
 * Page header for workspace pages: one left-aligned row with the title, a
 * one-line purpose and inline counts on the left, and the page's primary
 * action on the right. Deliberately plain (no icon tile, glow or chips) so
 * the page's own content starts in the first screen.
 */
export function PageHero({
  title,
  purpose,
  action,
  chips,
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
    <header className="page-header">
      <div className="page-header__text">
        <h1 className="page-header__title">{title}</h1>
        <p className="page-header__purpose">{purpose}</p>
        {chips && chips.length > 0 ? (
          <ul className="page-header__meta">
            {chips.map((chip) => (
              <li key={chip}>{chip}</li>
            ))}
          </ul>
        ) : null}
      </div>
      {action ? <div className="page-header__action">{action}</div> : null}
    </header>
  )
}

export { PageHero as PageHeader }

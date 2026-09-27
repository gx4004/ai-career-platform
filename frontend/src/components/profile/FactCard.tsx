import type { ReactNode } from 'react'
import { MoreHorizontal, type LucideIcon } from 'lucide-react'
import { Button } from '#/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '#/components/ui/dropdown-menu'
import { cn } from '#/lib/utils'

export type FactField = { key: string; label: ReactNode; value: ReactNode }
export type FactMenuItem = {
  label: string
  icon: LucideIcon
  onSelect: () => void
  destructive?: boolean
}

/**
 * One card per fact — a saved profile fact, a suggestion, or a skill to build.
 * The card has one primary action; everything else lives in its overflow menu.
 * State is carried by label + border + tint, never colour alone.
 */
export function FactCard({
  tone,
  meta,
  fields,
  primary,
  menu,
  menuLabel,
  busy = false,
  children,
}: {
  /** State modifier: confirmed | unconfirmed | planned | in_progress | completed. */
  tone: string
  meta: ReactNode
  fields: FactField[]
  primary: ReactNode
  menu: FactMenuItem[]
  /** Accessible name for the overflow trigger, e.g. "More actions: Python". */
  menuLabel: string
  busy?: boolean
  children?: ReactNode
}) {
  return (
    <li className={cn('fact-card', `fact-card--${tone}`)} data-state={tone} aria-busy={busy || undefined}>
      <div className="fact-card__meta">{meta}</div>

      {fields.length > 0 ? (
        <dl className="fact-card__fields">
          {fields.map((field) => (
            <div className="fact-field" key={field.key}>
              <dt className="fact-field__key">{field.label}</dt>
              <dd className="fact-field__value">{field.value}</dd>
            </div>
          ))}
        </dl>
      ) : (
        <p className="small-copy muted-copy">No details recorded.</p>
      )}

      {children}

      <div className="fact-card__actions">
        {primary}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button size="icon-sm" variant="ghost" disabled={busy} aria-label={menuLabel}>
              <MoreHorizontal size={16} />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {menu.map((item) => (
              <DropdownMenuItem
                key={item.label}
                variant={item.destructive ? 'destructive' : 'default'}
                onSelect={item.onSelect}
              >
                <item.icon /> {item.label}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </li>
  )
}

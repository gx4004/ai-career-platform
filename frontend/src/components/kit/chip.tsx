import { forwardRef, type ComponentPropsWithoutRef, type ReactNode } from 'react'
import { X } from 'lucide-react'
import { cn } from '#/lib/utils'

export type ChipProps = Omit<ComponentPropsWithoutRef<'span'>, 'children'> & {
  /** The term the person typed ("backend engineer"). */
  children: ReactNode
  /** Adds the remove button. Without it the chip is a plain value. */
  onRemove?: () => void
  /** Accessible name of the remove button: say what goes away ("Remove backend engineer"). Default "Remove". */
  removeLabel?: string
  /** Disables the remove button, e.g. while the list is saving. */
  disabled?: boolean
}

/**
 * A value the person entered that they can take back out: search terms, keywords, locations. Not a
 * status (that is Badge) and not a toggle (that is Button aria-pressed or Segmented). Put chips in a
 * `<ul>` of their own, one per `<li>`, so the list is announced with its count.
 */
export const Chip = forwardRef<HTMLSpanElement, ChipProps>(function Chip(
  { children, onRemove, removeLabel = 'Remove', disabled = false, className, ...rest },
  ref,
) {
  return (
    <span
      ref={ref}
      className={cn('kit-chip', className)}
      data-removable={onRemove ? 'true' : undefined}
      data-disabled={disabled ? 'true' : undefined}
      {...rest}
    >
      <span className="kit-chip__label">{children}</span>
      {onRemove ? (
        <button type="button" className="kit-chip__remove" aria-label={removeLabel} disabled={disabled} onClick={onRemove}>
          <X aria-hidden="true" />
        </button>
      ) : null}
    </span>
  )
})

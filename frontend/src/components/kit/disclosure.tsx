import { forwardRef, type ComponentPropsWithoutRef, type ElementRef, type ReactNode } from 'react'
import { Collapsible } from 'radix-ui'
import { ChevronDown } from 'lucide-react'
import { cn } from '#/lib/utils'

export type DisclosureVariant = 'section' | 'inline'

export type DisclosureProps = Omit<ComponentPropsWithoutRef<typeof Collapsible.Root>, 'title'> & {
  /** The trigger text. */
  title: ReactNode
  /** Quiet text at the end of a section row: a count, a status. Part of the trigger's name. */
  meta?: ReactNode
  /** section: full-width titled row. inline: small accent text button. */
  variant?: DisclosureVariant
  /** Wrap the trigger in a heading of this level, so it shows up in the page outline. */
  headingLevel?: 2 | 3 | 4 | 5 | 6
  /** Extra classes for the trigger button. */
  triggerClassName?: string
}

/**
 * Show/hide section. `open` + `onOpenChange` controls it, `defaultOpen` leaves it uncontrolled.
 * The trigger is a button with aria-expanded and aria-controls; closed content is not rendered.
 */
export const Disclosure = forwardRef<ElementRef<typeof Collapsible.Root>, DisclosureProps>(function Disclosure(
  { title, meta, variant = 'section', headingLevel, className, triggerClassName, children, ...rest },
  ref,
) {
  const trigger = (
    <Collapsible.Trigger className={cn('kit-disclosure__trigger', triggerClassName)}>
      <ChevronDown className="kit-disclosure__chevron" aria-hidden="true" />
      <span className="kit-disclosure__title">{title}</span>
      {meta !== undefined && meta !== null ? <span className="kit-disclosure__meta">{meta}</span> : null}
    </Collapsible.Trigger>
  )
  const Heading = headingLevel ? (`h${headingLevel}` as const) : null
  return (
    <Collapsible.Root ref={ref} className={cn('kit-disclosure', `kit-disclosure--${variant}`, className)} {...rest}>
      {Heading ? <Heading className="kit-disclosure__heading">{trigger}</Heading> : trigger}
      <Collapsible.Content className="kit-disclosure__content">{children}</Collapsible.Content>
    </Collapsible.Root>
  )
})

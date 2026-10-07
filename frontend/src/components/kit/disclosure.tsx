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
  /**
   * Title size of a section row. md (default): the 17px bold UI row. lg: the display 20/800 title of a PanelHeader,
   * for a Disclosure that is a whole panel's heading (a foldable panel next to plain ones).
   */
  size?: 'md' | 'lg'
  /**
   * Section rows only: the row is a whole Panel's heading. While open it draws the PanelHeader's 2px ink rule and the
   * content starts 20px under it, so a foldable panel reads like the PanelHeader panels beside it.
   */
  ruled?: boolean
}

/**
 * Show/hide section. `open` + `onOpenChange` controls it, `defaultOpen` leaves it uncontrolled.
 * The trigger is a button with aria-expanded and aria-controls; closed content is not rendered.
 */
export const Disclosure = forwardRef<ElementRef<typeof Collapsible.Root>, DisclosureProps>(function Disclosure(
  { title, meta, variant = 'section', headingLevel, size = 'md', ruled = false, className, triggerClassName, children, ...rest },
  ref,
) {
  const trigger = (
    <Collapsible.Trigger className={cn('kit-disclosure__trigger', triggerClassName)}>
      <ChevronDown className="kit-disclosure__chevron" aria-hidden="true" />
      {/* The title and meta share one label beside the chevron: the title's fit-content minimum is measured against the
          label, so a long title wraps beside the chevron instead of pushing it out of the row (KIT-1). */}
      <span className="kit-disclosure__label">
        <span className="kit-disclosure__title">{title}</span>
        {meta !== undefined && meta !== null ? <span className="kit-disclosure__meta">{meta}</span> : null}
      </span>
    </Collapsible.Trigger>
  )
  const Heading = headingLevel ? (`h${headingLevel}` as const) : null
  return (
    <Collapsible.Root
      ref={ref}
      className={cn('kit-disclosure', `kit-disclosure--${variant}`, className)}
      data-size={variant === 'section' && size === 'lg' ? 'lg' : undefined}
      data-ruled={variant === 'section' && ruled ? '' : undefined}
      {...rest}
    >
      {Heading ? <Heading className="kit-disclosure__heading">{trigger}</Heading> : trigger}
      <Collapsible.Content className="kit-disclosure__content">{children}</Collapsible.Content>
    </Collapsible.Root>
  )
})

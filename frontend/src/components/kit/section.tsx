import { forwardRef, useId, type ComponentPropsWithoutRef, type ReactNode } from 'react'
import { cn } from '#/lib/utils'
import { Count } from './badge'

export type SectionProps = Omit<ComponentPropsWithoutRef<'section'>, 'title'> & {
  title: ReactNode
  /** A number after the title ("Documents 3"). */
  count?: number | string
  /** Small controls at the end of the heading row (a Button size="sm", a link). They wrap under the title on phones. */
  actions?: ReactNode
  /** One quiet line under the heading row. */
  description?: ReactNode
  /** Level of the heading. Default 2; use 3 inside another section. */
  headingLevel?: 2 | 3 | 4 | 5 | 6
  /** Hairline under the heading row. Default true. */
  rule?: boolean
  /** Expose the section as a named region landmark. Default false: a dense page would otherwise get 6 to 10 regions. */
  landmark?: boolean
}

/**
 * The one section: heading row (title, count, actions), hairline, content. Sections are 32px apart
 * inside a Page, heading to content is 12px, and a List, Table or KeyValue sits directly under the
 * hairline. Replaces every *-section__head/title and *-panel__head/title.
 */
export const Section = forwardRef<HTMLElement, SectionProps>(function Section(
  { title, count, actions, description, headingLevel = 2, rule = true, landmark = false, className, children, id, ...rest },
  ref,
) {
  const generated = useId()
  const headingId = `${id ?? generated}-heading`
  const Heading = `h${headingLevel}` as 'h2'
  return (
    <section
      ref={ref}
      id={id}
      className={cn('kit-section', className)}
      data-rule={rule ? 'true' : undefined}
      aria-labelledby={landmark ? headingId : undefined}
      {...rest}
    >
      <div className="kit-section__head">
        <div className="kit-section__row">
          <Heading id={headingId} className="kit-section__title">
            {title}
            {count !== undefined ? (
              <>
                {' '}
                <Count value={count} className="kit-section__count" />
              </>
            ) : null}
          </Heading>
          {actions ? <div className="kit-section__actions">{actions}</div> : null}
        </div>
        {description ? <div className="kit-section__description">{description}</div> : null}
      </div>
      <div className="kit-section__body">{children}</div>
    </section>
  )
})

import { forwardRef, useId, type ComponentPropsWithoutRef, type ReactNode } from 'react'
import { cn } from '#/lib/utils'
import { Count } from './badge'
import type { Tone } from './tone'

export type SectionProps = Omit<ComponentPropsWithoutRef<'section'>, 'title'> & {
  title: ReactNode
  /** A number after the title, drawn as an outlined pill ("Needs action 2"). */
  count?: number | string
  /** Tone of the count pill: white (default), rose for needs-action, lemon for fix-first, mint for strengths. Colour by meaning. */
  countTone?: Tone
  /** Small controls at the end of the heading row (a Button size="sm", a link). They wrap under the title on phones. */
  actions?: ReactNode
  /** One quiet line under the heading row. */
  description?: ReactNode
  /** Level of the heading. Default 2; use 3 inside another section. */
  headingLevel?: 2 | 3 | 4 | 5 | 6
  /** A 2px ink rule under the heading row. Default false: sections are separated by whitespace. */
  rule?: boolean
  /** sm: a UI-type sub-heading (15/700) for a group inside another section or a disclosure. Default md (display 24). */
  size?: 'md' | 'sm'
  /** Expose the section as a named region landmark. Default false: a dense page would otherwise get 6 to 10 regions. */
  landmark?: boolean
}

/**
 * The one section: heading row (display title, count pill, actions), optional rule, content. Sections
 * are 40px apart inside a Page, heading to content is 16px. Replaces every *-section__head/title and
 * *-panel__head/title.
 */
export const Section = forwardRef<HTMLElement, SectionProps>(function Section(
  { title, count, countTone, actions, description, headingLevel = 2, rule = false, size = 'md', landmark = false, className, children, id, ...rest },
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
      data-size={size === 'sm' ? 'sm' : undefined}
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
                <Count value={count} variant="pill" tone={countTone ?? 'white'} className="kit-section__count" />
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

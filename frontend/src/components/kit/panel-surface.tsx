import { createElement, forwardRef, type ComponentPropsWithoutRef, type ElementType, type ReactNode } from 'react'
import { cn } from '#/lib/utils'
import { Count } from './badge'
import type { Tone } from './tone'

/*
 * The Sticker panel: a flat white container with a 2px ink outline and no shadow, for lists, forms
 * and grouped facts. Not to be confused with ./panel.tsx, the shared header/body/footer parts of
 * Dialog and Sheet.
 */

export type PanelProps = ComponentPropsWithoutRef<'div'> & {
  as?: 'div' | 'section' | 'article' | 'aside'
  /** white (default) or a tone: the panel takes that tone's soft tint (stone: the nested import card). */
  tone?: Tone
  /** Rows or a list sit directly inside: the panel clips to its radius so row fills do not poke out. */
  flush?: boolean
}

export const Panel = forwardRef<HTMLElement, PanelProps>(function Panel(
  { as = 'div', tone = 'white', flush = false, className, ...rest },
  ref,
) {
  return createElement(as as ElementType, {
    ref,
    className: cn('kit-panel-surface', className),
    'data-tone': tone,
    'data-flush': flush ? 'true' : undefined,
    ...rest,
  })
})

export type PanelHeaderProps = Omit<ComponentPropsWithoutRef<'div'>, 'title'> & {
  title: ReactNode
  /** A count pill after the title. */
  count?: number
  countTone?: Tone
  /** Right-aligned controls. */
  actions?: ReactNode
  /** Heading level of the title. Default 2. */
  headingLevel?: 2 | 3 | 4
  /** Fill the header with a tone's soft tint (lemon-soft marks a panel that needs attention). Default none: the panel's own fill. */
  tone?: Tone
}

export const PanelHeader = forwardRef<HTMLDivElement, PanelHeaderProps>(function PanelHeader(
  { title, count, countTone = 'white', actions, headingLevel = 2, tone, className, ...rest },
  ref,
) {
  const Heading = `h${headingLevel}` as 'h2' | 'h3' | 'h4'
  return (
    <div ref={ref} className={cn('kit-panel-surface__header', className)} data-tone={tone} {...rest}>
      <Heading className="kit-panel-surface__title">
        {title}
        {count !== undefined ? <Count variant="pill" tone={countTone} value={count} /> : null}
      </Heading>
      {actions ? <div className="kit-panel-surface__actions">{actions}</div> : null}
    </div>
  )
})

export type PanelBodyProps = ComponentPropsWithoutRef<'div'> & {
  /** No padding: a List or Table fills the body edge to edge. */
  flush?: boolean
}

export const PanelBody = forwardRef<HTMLDivElement, PanelBodyProps>(function PanelBody(
  { flush = false, className, ...rest },
  ref,
) {
  return <div ref={ref} className={cn('kit-panel-surface__body', className)} data-flush={flush ? 'true' : undefined} {...rest} />
})

export type PanelFooterProps = ComponentPropsWithoutRef<'div'> & {
  /** The soft tint of the band: mint for the pipeline's reply rate. Default stone. */
  tone?: Tone
}

export const PanelFooter = forwardRef<HTMLDivElement, PanelFooterProps>(function PanelFooter(
  { tone = 'stone', className, ...rest },
  ref,
) {
  return <div ref={ref} className={cn('kit-tone kit-panel-surface__footer', className)} data-tone={tone} {...rest} />
})

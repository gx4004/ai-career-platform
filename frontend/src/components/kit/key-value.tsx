import { forwardRef, type ComponentPropsWithoutRef, type CSSProperties, type ReactNode } from 'react'
import { cn } from '#/lib/utils'

export type KeyValueEntry = {
  label: ReactNode
  value: ReactNode
  /** Monospace value: ids, hashes, model names. */
  mono?: boolean
  key?: string
}

export type KeyValueProps = Omit<ComponentPropsWithoutRef<'dl'>, 'children'> & {
  /** Data-driven rows. Or pass KeyValueRow children. */
  items?: KeyValueEntry[]
  children?: ReactNode
  /** inline: label column then value (default). stacked: label above value, for narrow rails. */
  layout?: 'inline' | 'stacked'
  /** Hairlines between rows. Default true. */
  divided?: boolean
  /** Width of the label column (inline layout). Default 9rem. */
  labelWidth?: string
}

function isBlank(value: ReactNode) {
  return value === null || value === undefined || value === false || value === ''
}

export type KeyValueRowProps = Omit<ComponentPropsWithoutRef<'div'>, 'children'> & {
  label: ReactNode
  /** The value. Blank values render a quiet dash with a screen-reader "Not provided". */
  children?: ReactNode
  mono?: boolean
}

/** One label/value pair. */
export const KeyValueRow = forwardRef<HTMLDivElement, KeyValueRowProps>(function KeyValueRow(
  { label, children, mono = false, className, ...rest },
  ref,
) {
  return (
    <div ref={ref} className={cn('kit-kv__row', className)} {...rest}>
      <dt className="kit-kv__label">{label}</dt>
      <dd className="kit-kv__value" data-mono={mono ? 'true' : undefined}>
        {isBlank(children) ? (
          <span className="kit-kv__empty">
            <span aria-hidden="true">—</span>
            <span className="kit-sr-only">Not provided</span>
          </span>
        ) : (
          children
        )}
      </dd>
    </div>
  )
})

/**
 * Label/value rows, 32px tall, label quiet, values tabular. For details panels, rails and the
 * "Why it matters / Fix" pairs of a report. Replaces .rfield(s), .result-facts, ApplicationDetailsCard rows.
 */
export const KeyValue = forwardRef<HTMLDListElement, KeyValueProps>(function KeyValue(
  { items, children, layout = 'inline', divided = true, labelWidth, className, style, ...rest },
  ref,
) {
  return (
    <dl
      ref={ref}
      className={cn('kit-kv', className)}
      data-layout={layout}
      data-divided={divided ? 'true' : undefined}
      style={labelWidth ? ({ ...style, '--kit-kv-label': labelWidth } as CSSProperties) : style}
      {...rest}
    >
      {items?.map((item, index) => (
        <KeyValueRow key={item.key ?? index} label={item.label} mono={item.mono}>
          {item.value}
        </KeyValueRow>
      ))}
      {children}
    </dl>
  )
})

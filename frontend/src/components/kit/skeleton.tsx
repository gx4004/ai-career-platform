import { forwardRef, type CSSProperties, type ComponentPropsWithoutRef } from 'react'
import { cn } from '#/lib/utils'
import type { RowDensity } from './row'

export type SkeletonVariant = 'line' | 'block' | 'row' | 'card' | 'stat' | 'page'
export type SkeletonLineSize = 'body' | 'meta' | 'title' | 'display'

export type SkeletonProps = Omit<ComponentPropsWithoutRef<'div'>, 'children'> & {
  /**
   * line: a text line (or `lines` of them) in the height of the text it replaces. block: any
   * rectangle (width, height). row: Rows. card: Cards with a title and a meta line. stat: a Stat.
   * page: PageHeader plus two Sections of rows, for a route that has nothing yet.
   */
  variant?: SkeletonVariant
  /** line: the text style being replaced, so the placeholder is exactly as tall. Default body. */
  size?: SkeletonLineSize
  /** line/block: CSS width ("60%", "8rem"). Numbers are px. */
  width?: string | number
  /** block: CSS height. Numbers are px. */
  height?: string | number
  /** line: how many lines; the last one is shorter. */
  lines?: number
  /** row: compact 36 or comfortable 44. */
  density?: RowDensity
  /** row: a leading square, like an avatar or icon. */
  leading?: boolean
  /** row/card/stat: repeat this many times. */
  count?: number
  /** row: li, to sit inside a List (the rows are then hidden from assistive tech; mark the List aria-busy). Default div. */
  as?: 'div' | 'li'
  /**
   * Names the placeholder and makes it a live "status" region ("Loading jobs"). Without it the
   * placeholder is hidden from assistive tech: set it on ONE wrapper per loading area.
   */
  label?: string
}

const dimension = (value: string | number | undefined) => (typeof value === 'number' ? `${value}px` : value)

function Bar({ width, className }: { width?: string; className?: string }) {
  return <span className={cn('kit-skeleton__bar', className)} style={width ? { inlineSize: width } : undefined} />
}

function Line({ size, width }: { size: SkeletonLineSize; width?: string }) {
  return (
    <span className="kit-skeleton__line" data-size={size}>
      <Bar width={width} />
    </span>
  )
}

function RowShape({ density, leading, as: Tag }: { density: RowDensity; leading: boolean; as: 'div' | 'li' }) {
  return (
    <Tag className="kit-skeleton__row" data-density={density} aria-hidden="true">
      {leading ? <Bar className="kit-skeleton__leading" /> : null}
      <span className="kit-skeleton__text">
        <Line size="body" width="46%" />
        {density === 'comfortable' ? <Line size="meta" width="30%" /> : null}
      </span>
      <Bar className="kit-skeleton__trail" />
    </Tag>
  )
}

/**
 * Calm loading placeholders built from the same geometry tokens as Row, Card and Stat, so content
 * replaces them without shifting. A slow opacity pulse at most; none under reduced motion.
 * Replaces components/ui/skeleton and .run-row--skeleton, .today-skeleton, .history-skeleton-row, .camp-col--skeleton.
 */
export const Skeleton = forwardRef<HTMLDivElement, SkeletonProps>(function Skeleton(
  {
    variant = 'line',
    size = 'body',
    width,
    height,
    lines = 1,
    density = 'comfortable',
    leading = false,
    count = 1,
    as = 'div',
    label,
    className,
    style,
    ...rest
  },
  ref,
) {
  const repeat = Math.max(1, count)
  const a11y =
    variant === 'page' && label === undefined
      ? ({ role: 'status', 'aria-label': 'Loading', 'aria-busy': true } as const)
      : label
        ? ({ role: 'status', 'aria-label': label, 'aria-busy': true } as const)
        : ({ 'aria-hidden': true } as const)

  if (variant === 'row' && as === 'li') {
    return (
      <>
        {Array.from({ length: repeat }, (_, index) => (
          <RowShape key={index} density={density} leading={leading} as="li" />
        ))}
      </>
    )
  }

  const common = { ref, style, ...a11y, ...rest }
  // Live regions are announced by their text, not by aria-label, so the name is also real (hidden) text.
  const announced = label || (variant === 'page' ? 'Loading' : undefined)
  const sr = announced ? <span className="kit-sr-only">{announced}</span> : null

  if (variant === 'row') {
    return (
      <div className={cn('kit-skeleton kit-skeleton--rows', className)} {...common}>
        {Array.from({ length: repeat }, (_, index) => (
          <RowShape key={index} density={density} leading={leading} as="div" />
        ))}
        {sr}
      </div>
    )
  }

  if (variant === 'card') {
    return (
      <div className={cn('kit-skeleton kit-skeleton--cards', className)} {...common}>
        {Array.from({ length: repeat }, (_, index) => (
          <div key={index} className="kit-skeleton__card">
            <Line size="body" width="62%" />
            <Line size="meta" width="40%" />
          </div>
        ))}
        {sr}
      </div>
    )
  }

  if (variant === 'stat') {
    return (
      <div className={cn('kit-skeleton kit-skeleton--stats', className)} {...common}>
        {Array.from({ length: repeat }, (_, index) => (
          <div key={index} className="kit-skeleton__stat">
            <Line size="display" width="3.5rem" />
            <Line size="meta" width="5.5rem" />
          </div>
        ))}
        {sr}
      </div>
    )
  }

  if (variant === 'page') {
    return (
      <div className={cn('kit-skeleton kit-skeleton--page', className)} {...common}>
        <div className="kit-skeleton__header">
          <Line size="display" width="16rem" />
          <Line size="meta" width="11rem" />
        </div>
        {[0, 1].map((section) => (
          <div key={section} className="kit-skeleton__section">
            <div className="kit-skeleton__section-head">
              <Line size="body" width="8rem" />
            </div>
            <div className="kit-skeleton__rows">
              {[0, 1, 2].map((row) => (
                <RowShape key={row} density="comfortable" leading={false} as="div" />
              ))}
            </div>
          </div>
        ))}
        {sr}
      </div>
    )
  }

  if (variant === 'block') {
    return (
      <div
        className={cn('kit-skeleton kit-skeleton--block', className)}
        {...common}
        style={{ ...style, inlineSize: dimension(width), blockSize: dimension(height) } as CSSProperties}
      >
        <Bar />
        {sr}
      </div>
    )
  }

  const total = Math.max(1, lines)
  return (
    <div className={cn('kit-skeleton kit-skeleton--lines', className)} {...common}>
      {Array.from({ length: total }, (_, index) => (
        <Line
          key={index}
          size={size}
          width={dimension(index === total - 1 && total > 1 ? '60%' : (width ?? '100%'))}
        />
      ))}
      {sr}
    </div>
  )
})

import { forwardRef, type CSSProperties, type ComponentPropsWithoutRef } from 'react'
import { cn } from '#/lib/utils'
import type { RowDensity } from './row'

export type SkeletonVariant = 'line' | 'block' | 'row' | 'card' | 'stat' | 'page' | 'header' | 'sticker'
export type SkeletonLineSize = 'body' | 'meta' | 'title' | 'display'
export type SkeletonTrailing = 'meta' | 'button' | 'pips' | 'none'
export type SkeletonShape = 'rect' | 'circle'

export type SkeletonProps = Omit<ComponentPropsWithoutRef<'div'>, 'children'> & {
  /**
   * line: a text line (or `lines` of them) in the height of the text it replaces. block: any
   * rectangle (width, height). row: Rows. card: Cards with a title and a meta line. stat: a Stat.
   * page: PageHeader plus two Sections of rows, for a route that has nothing yet. header: the PageHeader alone
   * (title and lead), for a page that draws its own section skeletons below it. sticker: tone-less sticker
   * plates (radius 24, no frame) standing in for Stickers, `count` of them, `height` each (default 120px).
   */
  variant?: SkeletonVariant
  /** line: the text style being replaced, so the placeholder is exactly as tall. Default body. */
  size?: SkeletonLineSize
  /** line/block: CSS width ("60%", "8rem"). Numbers are px. */
  width?: string | number
  /** block: CSS height. Numbers are px. */
  height?: string | number
  /** block: rect (default) or circle, for a round placeholder such as an Avatar (give it equal width and height). */
  shape?: SkeletonShape
  /**
   * line: how many lines; the last one is shorter. row: the lines under the title (a summary that runs to two
   * lines, a company plus a reason line). Default 1 on a comfortable row, 0 on a compact one.
   */
  lines?: number
  /**
   * row: the lines under the title on a narrow List (under 32rem, a phone), where the real row's title and summary
   * wrap and its meta drops under the text. Default: the same as `lines`.
   */
  narrowLines?: number
  /**
   * row: what the end of the row holds once loaded. meta (default): a short date or count bar. button: an sm Button
   * (Add, Continue), which drops under the text on a narrow List as the real row's actions do. pips: a SkillPips run.
   * none: nothing.
   */
  trailing?: SkeletonTrailing
  /** row: compact 36 or comfortable 44. */
  density?: RowDensity
  /**
   * row: a leading square, like an avatar or icon (28px); `tile` is the 40px rounded square of a ToolTile md or a
   * StageMark; `stamp` is the 60x52 box of a FitStamp (52x48 on phones, as the stamp's sm size).
   */
  leading?: boolean | 'tile' | 'stamp'
  /**
   * row: open with a ListHeading strip (stone-soft, display title line, 2px --line rule) before the rows, for a list
   * that groups its rows under day headings ("Today", "Yesterday"), so the rows do not drop when the data arrives.
   */
  heading?: boolean
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

function Line({ size, width, only }: { size: SkeletonLineSize; width?: string; only?: 'narrow' | 'wide' }) {
  return (
    <span className="kit-skeleton__line" data-size={size} data-only={only}>
      <Bar width={width} />
    </span>
  )
}

/** Subtitle bar widths, so stacked lines read as prose of different lengths rather than one block. */
const SUBTITLE_WIDTHS = ['30%', '42%', '24%']

type RowShapeProps = {
  density: RowDensity
  leading: boolean | 'tile' | 'stamp'
  as: 'div' | 'li'
  lines?: number
  narrowLines?: number
  trailing: SkeletonTrailing
}

function RowShape({ density, leading, as: Tag, lines, narrowLines, trailing }: RowShapeProps) {
  const subtitles = Math.max(0, lines ?? (density === 'comfortable' ? 1 : 0))
  const narrow = Math.max(0, narrowLines ?? subtitles)
  // Lines past the wide count show only on a narrow List; lines past the narrow count only on a wide one.
  const only = (index: number) => (index >= subtitles ? 'narrow' : index >= narrow ? 'wide' : undefined)
  return (
    <Tag
      className="kit-skeleton__row"
      data-density={density}
      data-trailing={trailing === 'meta' ? undefined : trailing}
      aria-hidden="true"
    >
      {leading ? (
        <Bar
          className={cn(
            'kit-skeleton__leading',
            leading === 'tile' && 'kit-skeleton__leading--tile',
            leading === 'stamp' && 'kit-skeleton__leading--stamp',
          )}
        />
      ) : null}
      <span className="kit-skeleton__text">
        <Line size="body" width="46%" />
        {Array.from({ length: Math.max(subtitles, narrow) }, (_, index) => (
          <Line key={index} size="meta" width={SUBTITLE_WIDTHS[index % SUBTITLE_WIDTHS.length]} only={only(index)} />
        ))}
      </span>
      {trailing === 'none' ? null : (
        <Bar
          className={cn(
            'kit-skeleton__trail',
            trailing === 'button' && 'kit-skeleton__trail--button',
            trailing === 'pips' && 'kit-skeleton__trail--pips',
          )}
        />
      )}
    </Tag>
  )
}

/** The ListHeading box itself (same class, so the same padding, strip and rule) with a title-sized bar in place of the day. */
function HeadingShape({ as: Tag }: { as: 'div' | 'li' }) {
  return (
    <Tag className="kit-list-heading kit-skeleton__heading" aria-hidden="true">
      <Line size="title" width="6rem" />
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
    shape = 'rect',
    lines,
    narrowLines,
    trailing = 'meta',
    density = 'comfortable',
    leading = false,
    heading = false,
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
        {heading ? <HeadingShape as="li" /> : null}
        {Array.from({ length: repeat }, (_, index) => (
          <RowShape key={index} density={density} leading={leading} as="li" lines={lines} narrowLines={narrowLines} trailing={trailing} />
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
        {heading ? <HeadingShape as="div" /> : null}
        {Array.from({ length: repeat }, (_, index) => (
          <RowShape key={index} density={density} leading={leading} as="div" lines={lines} narrowLines={narrowLines} trailing={trailing} />
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
                <RowShape key={row} density="comfortable" leading={false} as="div" trailing="meta" />
              ))}
            </div>
          </div>
        ))}
        {sr}
      </div>
    )
  }

  if (variant === 'header') {
    return (
      <div className={cn('kit-skeleton kit-skeleton__header', className)} {...common}>
        <Line size="display" width={dimension(width) ?? '16rem'} />
        <Line size="body" width="min(32rem, 70%)" />
        {sr}
      </div>
    )
  }

  if (variant === 'sticker') {
    return (
      <div className={cn('kit-skeleton kit-skeleton--stickers', className)} {...common}>
        {Array.from({ length: repeat }, (_, index) => (
          <span
            key={index}
            className="kit-skeleton__sticker"
            style={height !== undefined ? { blockSize: dimension(height) } : undefined}
          />
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
        data-shape={shape === 'circle' ? 'circle' : undefined}
        style={{ ...style, inlineSize: dimension(width), blockSize: dimension(height) } as CSSProperties}
      >
        <Bar />
        {sr}
      </div>
    )
  }

  const total = Math.max(1, lines ?? 1)
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

import { forwardRef, type ComponentPropsWithoutRef, type CSSProperties } from 'react'
import type { LucideIcon } from 'lucide-react'
import { cn } from '#/lib/utils'
import type { Tone } from './tone'

export type ToolTileSize = 'sm' | 'md' | 'lg' | 'xl' | 'index'

export type ToolTileProps = Omit<ComponentPropsWithoutRef<'span'>, 'children'> & {
  /** The Sticker colour that says which tool this is (callers pass `tools[id].tone`; the kit never imports the registry). */
  tone?: Tone
  /** The tool's icon (callers pass `tools[id].icon`). */
  icon?: LucideIcon
  /** sm 28 (nav) | md 40 (rows) | lg 56 (page-title mark, tilted -4) | xl 120 (unscored result) | index: the full-height block of the landing tool list. */
  size?: ToolTileSize
  /** Degrees, -8..8. lg defaults to -4; the rest to 0. */
  tilt?: number
  /**
   * A tile inside a row (What next): level and without the hard shadow at any size. The tilted, shadowed lg
   * tile is the page-title mark only (STICKER 1.15). Ignores `tilt`.
   */
  flat?: boolean
}

/**
 * A tone-filled square holding a tool's icon: the colour that says which tool this is. Decorative
 * (aria-hidden): the label always sits next to it.
 */
export const ToolTile = forwardRef<HTMLSpanElement, ToolTileProps>(function ToolTile(
  { tone, icon, size = 'md', tilt, flat = false, className, style, ...rest },
  ref,
) {
  const Icon = icon
  const angle = flat
    ? 0
    : tilt === undefined
      ? size === 'lg'
        ? -4
        : 0
      : Math.min(8, Math.max(-8, Number.isFinite(tilt) ? tilt : 0))
  return (
    <span
      ref={ref}
      className={cn('kit-tool-tile', `kit-tool-tile--${size}`, className)}
      data-tone={tone ?? 'white'}
      data-flat={flat ? 'true' : undefined}
      aria-hidden="true"
      style={angle === 0 ? style : ({ ...style, '--kit-tilt': `${angle}deg` } as CSSProperties)}
      {...rest}
    >
      {Icon ? <Icon aria-hidden="true" focusable="false" strokeWidth={2} /> : null}
    </span>
  )
})

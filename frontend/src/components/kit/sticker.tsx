import { createElement, forwardRef, type ComponentPropsWithoutRef, type CSSProperties, type ElementType } from 'react'
import { cn } from '#/lib/utils'
import type { Tone } from './tone'

export type StickerSize = 'sm' | 'md' | 'xl'
export type StickerElement = 'div' | 'span' | 'article' | 'section' | 'li' | 'aside'

export type StickerProps = ComponentPropsWithoutRef<'div'> & {
  as?: StickerElement
  /** Fill, by meaning. Default white. */
  tone?: Tone
  /** sm: radius 16, padding 12/16, shadow 2 | md: radius 24, padding 20, shadow 4 | xl: radius 36, shadow 7. */
  size?: StickerSize
  /** Degrees, clamped to -3..3. The plate (outline, fill, shadow) tilts; the text never does. */
  tilt?: number
  /** slap: the sticker flies in and lands level (the result page, after the seal). */
  reveal?: 'slap' | 'none'
  /** Which slap this is: 1, 2 or 3 start at 880, 1100 and 1280 ms. */
  revealOrder?: 1 | 2 | 3
  /** The rose pin of the honest note, centred on the top edge. */
  pin?: boolean
}

const MAX_TILT = 3

export function clampTilt(tilt: number | undefined) {
  if (tilt === undefined || !Number.isFinite(tilt)) return 0
  return Math.min(MAX_TILT, Math.max(-MAX_TILT, tilt))
}

/**
 * An object, drawn as a sticker: a tone-filled plate with a 2px ink outline and a hard offset
 * shadow, optionally tilted a degree or two. The plate is a ::before that rotates; the content
 * block stays level so type is crisp and baselines are true. Text inside is always ink.
 */
export const Sticker = forwardRef<HTMLElement, StickerProps>(function Sticker(
  { as = 'div', tone = 'white', size = 'md', tilt, reveal = 'none', revealOrder = 1, pin = false, className, style, ...rest },
  ref,
) {
  const angle = clampTilt(tilt)
  return createElement(as as ElementType, {
    ref,
    className: cn('kit-sticker', `kit-sticker--${size}`, className),
    'data-tone': tone,
    'data-reveal': reveal === 'slap' ? 'slap' : undefined,
    'data-order': reveal === 'slap' ? revealOrder : undefined,
    'data-pin': pin ? 'true' : undefined,
    style: angle === 0 ? style : ({ ...style, '--kit-tilt': `${angle}deg` } as CSSProperties),
    ...rest,
  })
})

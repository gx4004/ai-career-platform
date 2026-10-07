import { forwardRef, useState, type AnimationEvent, type ComponentPropsWithoutRef, type CSSProperties } from 'react'
import { cn } from '#/lib/utils'
import { useCountUp } from '#/hooks/use-count-up'
import { usePrefersReducedMotion } from '#/hooks/use-prefers-reduced-motion'

/**
 * The scalloped edge: r(t) = R + A cos(N t), sampled 361 times, as one closed path in a 220 x 220 box.
 * Computed once at module load; 18 lobes of 5 units around a 93 radius (STICKER-SYSTEM 1.9).
 */
export function sealPath(cx: number, cy: number, radius: number, amplitude: number, lobes: number) {
  const points: string[] = []
  for (let i = 0; i <= 360; i++) {
    const t = (i / 360) * Math.PI * 2
    const r = radius + amplitude * Math.cos(lobes * t)
    points.push(`${(cx + r * Math.cos(t)).toFixed(2)},${(cy + r * Math.sin(t)).toFixed(2)}`)
  }
  return `M${points.join('L')}Z`
}

const SEAL_PATH = sealPath(110, 110, 93, 5, 18)

export type SealSize = 'sm' | 'md' | 'lg' | 'xl'
export type SealTone = 'tangerine' | 'lemon' | 'mint' | 'lilac' | 'rose' | 'stone'

/** The ladder only grows: sm the landing example card, md a phone or the 404 page, lg the landing closer, xl the result hero. */
const SIZES: Record<SealSize, number> = { sm: 170, md: 220, lg: 230, xl: 300 }

export type ScoreSealProps = Omit<ComponentPropsWithoutRef<'dl'>, 'children'> & {
  /** A score 0..max, or a short text such as "404" or "!". null renders the "not available" seal. */
  value: number | string | null
  /** The accessible name, rendered as the visually hidden <dt>: "Resume score". */
  label: string
  /** The line under the number. Default "/100"; null hides it. */
  unit?: '/100' | '%' | string | null
  /** Pixels, or a named size. Default xl (300). */
  size?: number | SealSize
  tone?: SealTone
  /** Resting rotation in degrees. Default -4. */
  rotate?: number
  /** stamp plays the signature reveal (fly in, ink ring, count-up); none renders the final state. Default none. */
  reveal?: 'stamp' | 'none'
  /** Count the number up from 0. Default: when reveal is stamp. */
  countUp?: boolean
  onRevealEnd?: () => void
}

/**
 * The score stamp: the one illustration of the product. A tone-filled scalloped seal with a hard
 * offset shadow, a dotted inner ring and the number set in the display face. It exposes its value
 * to assistive tech as a term and a description ("Resume score", "77 out of 100") and never
 * announces the count-up.
 */
export const ScoreSeal = forwardRef<HTMLDListElement, ScoreSealProps>(function ScoreSeal(
  {
    value,
    label,
    unit = '/100',
    size = 'xl',
    tone = 'tangerine',
    rotate = -4,
    reveal = 'none',
    countUp,
    onRevealEnd,
    className,
    style,
    onAnimationEnd,
    ...rest
  },
  ref,
) {
  const px = typeof size === 'number' ? size : SIZES[size]
  const missing = value === null || (typeof value === 'number' && !Number.isFinite(value))
  const resolvedTone: SealTone = missing ? 'stone' : tone
  const numeric = typeof value === 'number' && Number.isFinite(value)
  const stamping = reveal === 'stamp'
  const counted = useCountUp(numeric ? value : 0, { enabled: numeric && (countUp ?? stamping) })
  const finalText = missing ? '–' : String(value)
  const visible = numeric && (countUp ?? stamping) ? String(counted) : finalText
  // One size tier per character up to 8: longer words keep the 8-character tier and are clipped by the ring, not the seal.
  const digits = Math.min(Math.max(finalText.length, 1), 8)
  const reduced = usePrefersReducedMotion()
  const [finished, setFinished] = useState(false)

  const spoken = missing
    ? 'not available'
    : unit === '/100'
      ? `${finalText} out of 100`
      : unit
        ? `${finalText}${unit === '%' ? ' percent' : ` ${unit}`}`
        : finalText

  const handleAnimationEnd = (event: AnimationEvent<HTMLDListElement>) => {
    onAnimationEnd?.(event)
    if (event.target === event.currentTarget && event.animationName === 'kit-stamp') {
      setFinished(true)
      onRevealEnd?.()
    }
  }

  return (
    <dl
      ref={ref}
      className={cn('kit-seal', className)}
      data-tone={resolvedTone}
      data-reveal={stamping ? 'stamp' : 'none'}
      data-animating={stamping && !finished && !reduced ? 'true' : undefined}
      data-digits={digits}
      data-small={px <= 200 ? 'true' : undefined}
      data-missing={missing ? 'true' : undefined}
      style={{ ...style, '--seal': `${px}px`, '--seal-rotate': `${rotate}deg` } as CSSProperties}
      onAnimationEnd={handleAnimationEnd}
      {...rest}
    >
      <div className="kit-seal__group">
        <dt className="kit-sr-only">{label}</dt>
        <dd className="kit-seal__dd">
          <div className="kit-seal__art" aria-hidden="true">
            <svg viewBox="0 0 220 220" focusable="false">
              <path className="kit-seal__shadow" d={SEAL_PATH} />
              <path className="kit-seal__shape" d={SEAL_PATH} />
              <circle className="kit-seal__ring" cx="110" cy="110" r="80" />
            </svg>
          </div>
          <span className="kit-seal__body" aria-hidden="true">
            <span className="kit-seal__num">{visible}</span>
            {unit && !missing ? <span className="kit-seal__of">{unit}</span> : null}
          </span>
          <span className="kit-sr-only">{spoken}</span>
        </dd>
      </div>
    </dl>
  )
})

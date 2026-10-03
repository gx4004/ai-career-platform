import { forwardRef, type ComponentPropsWithoutRef } from 'react'
import { Avatar as AvatarPrimitive } from 'radix-ui'
import { cn } from '#/lib/utils'

export type AvatarSize = 'sm' | 'md' | 'lg'

export type AvatarProps = Omit<ComponentPropsWithoutRef<'span'>, 'children'> & {
  /** Whose it is. Drives the initials and the accessible name. */
  name: string
  /** Optional picture. While it loads, or when it fails, the initials show. */
  src?: string
  /** 24 / 28 / 36px. Default md. */
  size?: AvatarSize
  /** Hide it from assistive tech when the name is written out right next to it (the sidebar account button). */
  decorative?: boolean
}

/** First letters of the first and last word: "Ada Lovelace" is AL; for an email only the part before the @ counts ("grace.hopper@example.com" is GH). */
export function initialsOf(name: string) {
  const words = name
    .trim()
    .split('@')[0]
    .split(/[\s._-]+/)
    .filter(Boolean)
  if (words.length === 0) return '?'
  const first = words[0][0]
  const last = words.length > 1 ? words[words.length - 1][0] : ''
  return `${first}${last}`.toUpperCase()
}

/**
 * A round identity mark: the picture if there is one, otherwise the person's initials on a quiet
 * stone disc (no per-person colours). Replaces components/ui/avatar and the `avatar-ring` styling.
 */
export const Avatar = forwardRef<HTMLSpanElement, AvatarProps>(function Avatar(
  { name, src, size = 'md', decorative = false, className, ...rest },
  ref,
) {
  return (
    <AvatarPrimitive.Root
      ref={ref}
      className={cn('kit-avatar', className)}
      data-size={size}
      {...(decorative ? { 'aria-hidden': true } : { role: 'img', 'aria-label': name })}
      {...rest}
    >
      {src ? <AvatarPrimitive.Image className="kit-avatar__image" src={src} alt="" /> : null}
      <AvatarPrimitive.Fallback className="kit-avatar__initials" delayMs={src ? 300 : undefined}>
        {initialsOf(name)}
      </AvatarPrimitive.Fallback>
    </AvatarPrimitive.Root>
  )
})

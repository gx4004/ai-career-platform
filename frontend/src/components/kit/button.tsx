import { forwardRef, type ComponentPropsWithoutRef, type MouseEvent } from 'react'
import { Slot } from 'radix-ui'
import { cn } from '#/lib/utils'

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'destructive' | 'link'
export type ButtonSize = 'sm' | 'md' | 'lg'

type ButtonOwnProps = {
  variant?: ButtonVariant
  size?: ButtonSize
  /** Shows a spinner in place of the label, keeps the width, ignores clicks, stays focusable. */
  loading?: boolean
  /** Render the single child element (a link, a router Link) with the button's classes and behaviour. */
  asChild?: boolean
}

type TextButtonProps = ButtonOwnProps & { iconOnly?: false }

/**
 * Icon-only buttons are square and must carry an accessible name, unless the whole button is a decorative,
 * pointer-only shortcut for something the keyboard already reaches another way: then it is hidden from
 * assistive tech and the tab order (aria-hidden plus tabIndex -1) and has no name to give.
 */
type IconButtonProps = ButtonOwnProps & { iconOnly: true } & (
    | { 'aria-label': string }
    | { 'aria-labelledby': string }
    | { 'aria-hidden': true | 'true'; tabIndex: -1 }
  )

export type ButtonProps = ComponentPropsWithoutRef<'button'> & (TextButtonProps | IconButtonProps)

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(props, ref) {
  const {
    variant = 'primary',
    size = 'md',
    loading = false,
    asChild = false,
    iconOnly = false,
    className,
    disabled = false,
    onClick,
    children,
    ...rest
  } = props

  const Comp = asChild ? Slot.Root : 'button'
  const inert = loading || (asChild && disabled)

  const handleClick = (event: MouseEvent<HTMLButtonElement>) => {
    if (inert) {
      event.preventDefault()
      event.stopPropagation()
      return
    }
    onClick?.(event)
  }

  return (
    <Comp
      ref={ref}
      className={cn(
        'kit-button',
        `kit-button--${variant}`,
        `kit-button--${size}`,
        iconOnly && 'kit-button--icon',
        className,
      )}
      data-loading={loading ? 'true' : undefined}
      data-disabled={asChild && disabled ? 'true' : undefined}
      aria-busy={loading || undefined}
      aria-disabled={inert || undefined}
      disabled={asChild ? undefined : disabled}
      tabIndex={asChild && disabled ? -1 : undefined}
      {...rest}
      onClick={handleClick}
    >
      {asChild ? <Slot.Slottable>{children}</Slot.Slottable> : children}
      {loading ? <span className="kit-button__spinner" aria-hidden="true" /> : null}
    </Comp>
  )
})

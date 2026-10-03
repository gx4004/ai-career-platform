import { forwardRef, type ComponentPropsWithoutRef, type ElementRef } from 'react'
import { Popover as PopoverPrimitive } from 'radix-ui'
import { cn } from '#/lib/utils'

/** `open` / `defaultOpen` / `onOpenChange`. Click or tap opens it, so it works on touch (unlike a tooltip). */
export const Popover = PopoverPrimitive.Root
export const PopoverTrigger = PopoverPrimitive.Trigger
/** Position the popover against another element than the trigger. */
export const PopoverAnchor = PopoverPrimitive.Anchor
export const PopoverClose = PopoverPrimitive.Close

export type PopoverContentProps = ComponentPropsWithoutRef<typeof PopoverPrimitive.Content>

/**
 * Small non-modal panel for explanatory text or a few controls. Focus moves into it on open, Esc or an
 * outside click closes it, and focus returns to the trigger. Needs no title; add `aria-label` or
 * `aria-labelledby` when it holds controls.
 */
export const PopoverContent = forwardRef<ElementRef<typeof PopoverPrimitive.Content>, PopoverContentProps>(
  function PopoverContent({ className, sideOffset = 6, align = 'start', collisionPadding = 8, ...rest }, ref) {
    return (
      <PopoverPrimitive.Portal>
        <PopoverPrimitive.Content
          ref={ref}
          className={cn('kit-popover', className)}
          sideOffset={sideOffset}
          align={align}
          collisionPadding={collisionPadding}
          {...rest}
        />
      </PopoverPrimitive.Portal>
    )
  },
)

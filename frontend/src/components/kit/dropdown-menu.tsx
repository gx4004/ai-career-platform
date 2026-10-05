import { forwardRef, type ComponentPropsWithoutRef, type ElementRef, type ReactNode } from 'react'
import { DropdownMenu as MenuPrimitive, Slot } from 'radix-ui'
import { Check } from 'lucide-react'
import { cn } from '#/lib/utils'
import { Kbd } from './badge'

/** `open` / `defaultOpen` / `onOpenChange` / `modal`. Use `<DropdownMenuTrigger asChild>` around a kit Button. */
export const DropdownMenu = MenuPrimitive.Root
export const DropdownMenuTrigger = MenuPrimitive.Trigger
export const DropdownMenuGroup = MenuPrimitive.Group
/** `value` + `onValueChange` for a set of DropdownMenuRadioItem. */
export const DropdownMenuRadioGroup = MenuPrimitive.RadioGroup

export type DropdownMenuContentProps = ComponentPropsWithoutRef<typeof MenuPrimitive.Content>

/** Portalled panel. Arrow keys move, type-ahead jumps, Esc closes and focus returns to the trigger. */
export const DropdownMenuContent = forwardRef<ElementRef<typeof MenuPrimitive.Content>, DropdownMenuContentProps>(
  function DropdownMenuContent({ className, sideOffset = 4, align = 'start', collisionPadding = 8, ...rest }, ref) {
    return (
      <MenuPrimitive.Portal>
        <MenuPrimitive.Content
          ref={ref}
          className={cn('kit-menu', className)}
          sideOffset={sideOffset}
          align={align}
          collisionPadding={collisionPadding}
          {...rest}
        />
      </MenuPrimitive.Portal>
    )
  },
)

type ItemExtras = {
  /** Leading icon (16px). Decorative: the label names the item. */
  icon?: ReactNode
  /** Shortcut hint drawn as a quiet Kbd at the end, e.g. "⌘K". It does not register the shortcut. */
  shortcut?: ReactNode
}

export type DropdownMenuItemProps = ComponentPropsWithoutRef<typeof MenuPrimitive.Item> &
  ItemExtras & {
    /** Red text and a rose highlight for an action that removes something. Keep it last, after a separator. */
    destructive?: boolean
  }

/**
 * `onSelect` runs on click and Enter; call event.preventDefault() in it to keep the menu open.
 * With `asChild` the child (a router Link, an anchor) becomes the item and receives the icon and shortcut inside it.
 */
export const DropdownMenuItem = forwardRef<ElementRef<typeof MenuPrimitive.Item>, DropdownMenuItemProps>(
  function DropdownMenuItem({ icon, shortcut, destructive = false, asChild, className, children, ...rest }, ref) {
    return (
      <MenuPrimitive.Item
        ref={ref}
        asChild={asChild}
        className={cn('kit-menu__item', className)}
        data-tone={destructive ? 'danger' : undefined}
        {...rest}
      >
        {icon ? (
          <span className="kit-menu__icon" aria-hidden="true">
            {icon}
          </span>
        ) : null}
        {asChild ? <Slot.Slottable>{children}</Slot.Slottable> : children}
        {shortcut ? <Kbd className="kit-menu__shortcut">{shortcut}</Kbd> : null}
      </MenuPrimitive.Item>
    )
  },
)

function Indicator() {
  return (
    <span className="kit-menu__indicator" aria-hidden="true">
      <MenuPrimitive.ItemIndicator>
        <Check />
      </MenuPrimitive.ItemIndicator>
    </span>
  )
}

export type DropdownMenuCheckboxItemProps = ComponentPropsWithoutRef<typeof MenuPrimitive.CheckboxItem> &
  Pick<ItemExtras, 'shortcut'>

/** `checked` + `onCheckedChange`. The menu closes on select unless onSelect calls preventDefault(). */
export const DropdownMenuCheckboxItem = forwardRef<
  ElementRef<typeof MenuPrimitive.CheckboxItem>,
  DropdownMenuCheckboxItemProps
>(function DropdownMenuCheckboxItem({ shortcut, className, children, ...rest }, ref) {
  return (
    <MenuPrimitive.CheckboxItem ref={ref} className={cn('kit-menu__item', className)} {...rest}>
      <Indicator />
      {children}
      {shortcut ? <Kbd className="kit-menu__shortcut">{shortcut}</Kbd> : null}
    </MenuPrimitive.CheckboxItem>
  )
})

export type DropdownMenuRadioItemProps = ComponentPropsWithoutRef<typeof MenuPrimitive.RadioItem> &
  Pick<ItemExtras, 'shortcut'>

/** Inside a DropdownMenuRadioGroup. `value` is required. */
export const DropdownMenuRadioItem = forwardRef<
  ElementRef<typeof MenuPrimitive.RadioItem>,
  DropdownMenuRadioItemProps
>(function DropdownMenuRadioItem({ shortcut, className, children, ...rest }, ref) {
  return (
    <MenuPrimitive.RadioItem ref={ref} className={cn('kit-menu__item', className)} {...rest}>
      <Indicator />
      {children}
      {shortcut ? <Kbd className="kit-menu__shortcut">{shortcut}</Kbd> : null}
    </MenuPrimitive.RadioItem>
  )
})

/** Group heading in sentence case ("Move to", "Add a section"). Not an eyebrow: no caps, no tracking. */
export const DropdownMenuLabel = forwardRef<
  ElementRef<typeof MenuPrimitive.Label>,
  ComponentPropsWithoutRef<typeof MenuPrimitive.Label>
>(function DropdownMenuLabel({ className, ...rest }, ref) {
  return <MenuPrimitive.Label ref={ref} className={cn('kit-menu__label', className)} {...rest} />
})

export const DropdownMenuSeparator = forwardRef<
  ElementRef<typeof MenuPrimitive.Separator>,
  ComponentPropsWithoutRef<typeof MenuPrimitive.Separator>
>(function DropdownMenuSeparator({ className, ...rest }, ref) {
  return <MenuPrimitive.Separator ref={ref} className={cn('kit-menu__separator', className)} {...rest} />
})

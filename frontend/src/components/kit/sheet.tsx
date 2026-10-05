import { forwardRef, type ComponentPropsWithoutRef, type ElementRef } from 'react'
import { Dialog as DialogPrimitive } from 'radix-ui'
import { cn } from '#/lib/utils'
import {
  PanelBody,
  PanelClose,
  PanelDescription,
  PanelFooter,
  PanelForm,
  PanelHeader,
  PanelTitle,
  isToastInteraction,
  usePanelFocus,
} from './panel'

/** Where the sheet sits. `responsive` is a right-hand drawer above 767px and a bottom sheet at 767px and below. */
export type SheetSide = 'responsive' | 'right' | 'bottom'
export type SheetSize = 'sm' | 'md' | 'lg'

/** `open` / `defaultOpen` / `onOpenChange`. Same modal behaviour as Dialog. */
export const Sheet = DialogPrimitive.Root
export const SheetTrigger = DialogPrimitive.Trigger
export const SheetClose = DialogPrimitive.Close

export const SheetHeader = PanelHeader
export const SheetTitle = PanelTitle
export const SheetDescription = PanelDescription
export const SheetBody = PanelBody
export const SheetFooter = PanelFooter
export const SheetForm = PanelForm

export type SheetContentProps = ComponentPropsWithoutRef<typeof DialogPrimitive.Content> & {
  side?: SheetSide
  /** Drawer width: sm 384px, md 480px, lg 576px. Bottom sheets are always full width. */
  size?: SheetSize
  showClose?: boolean
  closeLabel?: string
  /** false blocks Esc, outside click and the X. */
  dismissible?: boolean
}

/**
 * Side drawer or bottom sheet. Bottom sheets stop at 85% of the viewport height, scroll inside the
 * SheetBody and pad for the home-indicator safe area. They carry a grab bar that is decoration only (no dragging):
 * the sheet closes with the X, Esc or a tap outside.
 */
export const SheetContent = forwardRef<ElementRef<typeof DialogPrimitive.Content>, SheetContentProps>(
  function SheetContent(
    {
      side = 'responsive',
      size = 'md',
      showClose = true,
      closeLabel,
      dismissible = true,
      className,
      children,
      onEscapeKeyDown,
      onInteractOutside,
      onOpenAutoFocus,
      onCloseAutoFocus,
      ...rest
    },
    ref,
  ) {
    const focus = usePanelFocus({ onOpenAutoFocus, onCloseAutoFocus })
    return (
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="kit-scrim" />
        <DialogPrimitive.Content
          ref={ref}
          className={cn('kit-sheet', className)}
          data-side={side}
          data-size={size}
          data-closable={showClose && dismissible ? 'true' : undefined}
          onEscapeKeyDown={(event) => {
            onEscapeKeyDown?.(event)
            if (!dismissible) event.preventDefault()
          }}
          onInteractOutside={(event) => {
            onInteractOutside?.(event)
            if (!dismissible || isToastInteraction(event)) event.preventDefault()
          }}
          {...focus}
          {...rest}
        >
          <span className="kit-sheet__grab" aria-hidden="true" />
          {children}
          {showClose && dismissible ? <PanelClose label={closeLabel} /> : null}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    )
  },
)

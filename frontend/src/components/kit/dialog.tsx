import { forwardRef, useRef, type ComponentPropsWithoutRef, type ElementRef, type ReactNode } from 'react'
import { Dialog as DialogPrimitive } from 'radix-ui'
import { cn } from '#/lib/utils'
import { Button } from './button'
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

export type DialogSize = 'sm' | 'md' | 'lg'

/** `open` / `defaultOpen` / `onOpenChange` / `modal`. Uncontrolled with a DialogTrigger, or controlled. */
export const Dialog = DialogPrimitive.Root
export const DialogTrigger = DialogPrimitive.Trigger
export const DialogClose = DialogPrimitive.Close

export const DialogHeader = PanelHeader
export const DialogTitle = PanelTitle
export const DialogDescription = PanelDescription
export const DialogBody = PanelBody
export const DialogFooter = PanelFooter
export const DialogForm = PanelForm

export type DialogContentProps = ComponentPropsWithoutRef<typeof DialogPrimitive.Content> & {
  /** Width: sm 400px (confirms), md 512px (forms), lg 720px (previews, long forms). Never wider than the viewport minus 16px gutters. */
  size?: DialogSize
  /** The X button in the corner. */
  showClose?: boolean
  closeLabel?: string
  /** false blocks Esc, outside click and the X, e.g. while a delete is in flight. */
  dismissible?: boolean
}

/**
 * Portal, flat scrim and panel in one. Radix gives the modal behaviour: focus is trapped and
 * returned to the trigger, Esc and outside click close, the page behind is inert and does not scroll.
 * Name it with a DialogTitle (use visuallyHidden for a silent one) and describe it with a
 * DialogDescription, or pass aria-describedby={undefined}.
 */
export const DialogContent = forwardRef<ElementRef<typeof DialogPrimitive.Content>, DialogContentProps>(
  function DialogContent(
    {
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
          className={cn('kit-dialog', className)}
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
          {children}
          {showClose && dismissible ? <PanelClose label={closeLabel} /> : null}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    )
  },
)

export type ConfirmDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: ReactNode
  description?: ReactNode
  /** Verb phrase for the action: "Delete application", not "OK". */
  confirmLabel: string
  cancelLabel?: string
  /** destructive: oxblood confirm button. default: the forest primary. */
  tone?: 'destructive' | 'default'
  /** Icon inside the confirm button. */
  icon?: ReactNode
  /** The action is running: the dialog cannot be dismissed and the confirm button shows a spinner. */
  pending?: boolean
  onConfirm: () => void
  /** Extra content between the description and the buttons. */
  children?: ReactNode
  /** Where focus goes on close. Needed when a menu item opened it (the item is gone): event.preventDefault() then focus your own element. */
  onCloseAutoFocus?: (event: Event) => void
}

/**
 * "Are you sure?" for a permanent or costly action. role=alertdialog, opens focused on
 * Cancel, and while `pending` it ignores Esc and outside clicks so the outcome is never ambiguous.
 * It does not close itself: close it from onOpenChange (cancel) or when the action finishes.
 */
export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel,
  cancelLabel = 'Cancel',
  tone = 'destructive',
  icon,
  pending = false,
  onConfirm,
  children,
  onCloseAutoFocus,
}: ConfirmDialogProps) {
  const cancelRef = useRef<HTMLButtonElement | null>(null)
  return (
    <Dialog open={open} onOpenChange={(next) => !pending && onOpenChange(next)}>
      <DialogContent
        size="sm"
        role="alertdialog"
        showClose={false}
        dismissible={!pending}
        onCloseAutoFocus={onCloseAutoFocus}
        {...(description ? {} : { 'aria-describedby': undefined })}
        onOpenAutoFocus={(event) => {
          event.preventDefault()
          cancelRef.current?.focus()
        }}
      >
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description ? <DialogDescription>{description}</DialogDescription> : null}
        </DialogHeader>
        {children ? <DialogBody>{children}</DialogBody> : null}
        <DialogFooter>
          <DialogClose asChild>
            <Button ref={cancelRef} type="button" variant="secondary" disabled={pending}>
              {cancelLabel}
            </Button>
          </DialogClose>
          <Button
            type="button"
            variant={tone === 'destructive' ? 'destructive' : 'primary'}
            loading={pending}
            onClick={onConfirm}
          >
            {icon}
            {confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

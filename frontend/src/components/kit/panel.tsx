import {
  forwardRef,
  useCallback,
  useEffect,
  useRef,
  useState,
  type ComponentPropsWithoutRef,
  type ElementRef,
} from 'react'
import { Dialog as DialogPrimitive } from 'radix-ui'
import { X } from 'lucide-react'
import { cn } from '#/lib/utils'
import { Button } from './button'
import { useMergedRef } from './utils'

/*
 * Parts shared by Dialog and Sheet: both are the same modal Radix primitive
 * with a different frame, so the header, title, body and footer are one set.
 */

export const PanelHeader = forwardRef<HTMLDivElement, ComponentPropsWithoutRef<'div'>>(function PanelHeader(
  { className, ...rest },
  ref,
) {
  return <div ref={ref} className={cn('kit-panel__header', className)} {...rest} />
})

type TitleProps = ComponentPropsWithoutRef<typeof DialogPrimitive.Title> & {
  /** Keep the title for assistive tech but do not draw it (AuthDialog, command palette). */
  visuallyHidden?: boolean
}

export const PanelTitle = forwardRef<ElementRef<typeof DialogPrimitive.Title>, TitleProps>(function PanelTitle(
  { className, visuallyHidden = false, ...rest },
  ref,
) {
  return (
    <DialogPrimitive.Title
      ref={ref}
      className={cn('kit-panel__title', visuallyHidden && 'kit-sr-only', className)}
      {...rest}
    />
  )
})

type DescriptionProps = ComponentPropsWithoutRef<typeof DialogPrimitive.Description> & {
  visuallyHidden?: boolean
}

export const PanelDescription = forwardRef<ElementRef<typeof DialogPrimitive.Description>, DescriptionProps>(
  function PanelDescription({ className, visuallyHidden = false, ...rest }, ref) {
    return (
      <DialogPrimitive.Description
        ref={ref}
        className={cn('kit-panel__description', visuallyHidden && 'kit-sr-only', className)}
        {...rest}
      />
    )
  },
)

/**
 * The scrolling region. When its content overflows it becomes keyboard focusable
 * (so arrow keys and Page Down can scroll it); otherwise it adds no tab stop.
 */
export const PanelBody = forwardRef<HTMLDivElement, ComponentPropsWithoutRef<'div'>>(function PanelBody(
  { className, tabIndex, ...rest },
  ref,
) {
  const inner = useRef<HTMLDivElement | null>(null)
  const merged = useMergedRef(ref, inner)
  const [scrollable, setScrollable] = useState(false)

  useEffect(() => {
    const element = inner.current
    if (!element) return
    const measure = () => setScrollable(element.scrollHeight > element.clientHeight + 1)
    measure()
    if (typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(measure)
    observer.observe(element)
    for (const child of Array.from(element.children)) observer.observe(child)
    return () => observer.disconnect()
  }, [])

  return (
    <div
      ref={merged}
      className={cn('kit-panel__body', className)}
      tabIndex={tabIndex ?? (scrollable ? 0 : undefined)}
      {...rest}
    />
  )
})

export const PanelFooter = forwardRef<HTMLDivElement, ComponentPropsWithoutRef<'div'>>(function PanelFooter(
  { className, ...rest },
  ref,
) {
  return <div ref={ref} className={cn('kit-panel__footer', className)} {...rest} />
})

/** Wrapper for form dialogs: the form carries header, body and footer so Enter submits and the body still scrolls. */
export const PanelForm = forwardRef<HTMLFormElement, ComponentPropsWithoutRef<'form'>>(function PanelForm(
  { className, ...rest },
  ref,
) {
  return <form ref={ref} className={cn('kit-panel__form', className)} {...rest} />
})

/**
 * Toasts live outside the modal. Pressing one (Undo, dismiss) while a dialog or sheet
 * is open must not count as an outside click that closes the modal.
 */
export function isToastInteraction(event: Event) {
  const target = event.target
  return target instanceof Element && target.closest('[data-kit-toast-region]') !== null
}

const FOCUSABLE = 'a[href], button:not(:disabled), input:not([type="hidden"]):not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])'

type AutoFocusHandlers = Pick<
  ComponentPropsWithoutRef<typeof DialogPrimitive.Content>,
  'onOpenAutoFocus' | 'onCloseAutoFocus'
>

/**
 * Focus handling Radix leaves to the page:
 *  - open: focus the first real control, not the scrolling body (which is only focusable so it can be scrolled);
 *  - close: give focus back to whatever had it before opening, also when the dialog was opened from a plain
 *    button or state instead of a DialogTrigger (Radix only restores to a DialogTrigger).
 * A handler passed by the caller runs first and wins by calling event.preventDefault().
 */
export function usePanelFocus({ onOpenAutoFocus, onCloseAutoFocus }: AutoFocusHandlers): Required<AutoFocusHandlers> {
  const opener = useRef<HTMLElement | null>(null)

  const handleOpen = useCallback<Required<AutoFocusHandlers>['onOpenAutoFocus']>(
    (event) => {
      opener.current = document.activeElement instanceof HTMLElement ? document.activeElement : null
      onOpenAutoFocus?.(event)
      if (event.defaultPrevented) return
      const content = event.target
      if (!(content instanceof HTMLElement)) return
      const first = Array.from(content.querySelectorAll<HTMLElement>(FOCUSABLE)).find(
        (element) => !element.classList.contains('kit-panel__body'),
      )
      if (first) {
        event.preventDefault()
        first.focus({ preventScroll: true })
      }
    },
    [onOpenAutoFocus],
  )

  const handleClose = useCallback<Required<AutoFocusHandlers>['onCloseAutoFocus']>(
    (event) => {
      onCloseAutoFocus?.(event)
      if (event.defaultPrevented) return
      const target = opener.current
      opener.current = null
      if (target && target !== document.body && target.isConnected) {
        event.preventDefault()
        target.focus()
      }
    },
    [onCloseAutoFocus],
  )

  return { onOpenAutoFocus: handleOpen, onCloseAutoFocus: handleClose }
}

export function PanelClose({ label = 'Close' }: { label?: string }) {
  return (
    <DialogPrimitive.Close asChild>
      <Button type="button" iconOnly variant="ghost" size="sm" className="kit-panel__close" aria-label={label}>
        <X aria-hidden="true" />
      </Button>
    </DialogPrimitive.Close>
  )
}

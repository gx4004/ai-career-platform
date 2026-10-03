import { createContext, forwardRef, useContext, type ComponentPropsWithoutRef, type ElementRef, type ReactElement, type ReactNode } from 'react'
import { Tooltip as TooltipPrimitive } from 'radix-ui'
import { cn } from '#/lib/utils'
import { Kbd } from './badge'

const ProviderContext = createContext(false)

/** Mount once near the app root: moving between tooltips then skips the delay. Tooltip works without it. */
export function TooltipProvider({
  delayDuration = 400,
  skipDelayDuration = 300,
  ...rest
}: ComponentPropsWithoutRef<typeof TooltipPrimitive.Provider>) {
  return (
    <ProviderContext.Provider value>
      <TooltipPrimitive.Provider delayDuration={delayDuration} skipDelayDuration={skipDelayDuration} {...rest} />
    </ProviderContext.Provider>
  )
}

export const TooltipTrigger = TooltipPrimitive.Trigger

export type TooltipContentProps = ComponentPropsWithoutRef<typeof TooltipPrimitive.Content>

/** Ink bubble, no arrow. Radix adds role="tooltip" and wires aria-describedby on the trigger while it is open. */
export const TooltipContent = forwardRef<ElementRef<typeof TooltipPrimitive.Content>, TooltipContentProps>(
  function TooltipContent({ className, sideOffset = 6, collisionPadding = 8, ...rest }, ref) {
    return (
      <TooltipPrimitive.Portal>
        <TooltipPrimitive.Content
          ref={ref}
          className={cn('kit-tooltip', className)}
          sideOffset={sideOffset}
          collisionPadding={collisionPadding}
          {...rest}
        />
      </TooltipPrimitive.Portal>
    )
  },
)

export type TooltipProps = {
  /** The bubble text. Keep it to a few words: it is a label, not a place for information people need. */
  content: ReactNode
  /** Shortcut hint shown as a Kbd after the text. */
  shortcut?: ReactNode
  side?: 'top' | 'right' | 'bottom' | 'left'
  align?: 'start' | 'center' | 'end'
  /** ms before it opens on hover. Focus (keyboard) opens it at once. */
  delayDuration?: number
  open?: boolean
  defaultOpen?: boolean
  onOpenChange?: (open: boolean) => void
  /** A single focusable element: a kit Button, a link. It receives the trigger props. */
  children: ReactElement
}

/**
 * `<Tooltip content="Close"><Button iconOnly aria-label="Close" …/></Tooltip>`.
 * Hover and keyboard focus only; a tap does not open it, so never put essential information in one (use Popover).
 * A disabled button swallows pointer events: wrap it in a span and put the Tooltip around the span.
 */
export function Tooltip({
  content,
  shortcut,
  side = 'top',
  align = 'center',
  delayDuration,
  open,
  defaultOpen,
  onOpenChange,
  children,
}: TooltipProps) {
  const hasProvider = useContext(ProviderContext)
  const root = (
    <TooltipPrimitive.Root
      delayDuration={delayDuration}
      open={open}
      defaultOpen={defaultOpen}
      onOpenChange={onOpenChange}
    >
      <TooltipPrimitive.Trigger asChild>{children}</TooltipPrimitive.Trigger>
      <TooltipContent side={side} align={align}>
        {content}
        {shortcut ? <Kbd>{shortcut}</Kbd> : null}
      </TooltipContent>
    </TooltipPrimitive.Root>
  )
  return hasProvider ? root : <TooltipProvider>{root}</TooltipProvider>
}

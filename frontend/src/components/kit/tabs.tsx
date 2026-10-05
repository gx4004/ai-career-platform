import { forwardRef, type ComponentPropsWithoutRef, type ElementRef, type ReactNode } from 'react'
import { Tabs as TabsPrimitive } from 'radix-ui'
import { cn } from '#/lib/utils'
import { Count } from './badge'

export type TabsVariant = 'folder' | 'plain'

export type TabsProps = ComponentPropsWithoutRef<typeof TabsPrimitive.Root> & {
  /**
   * folder (default): folder tabs sitting on a white outlined panel, the selected tab opening into it.
   * plain: the same tab row over a bare content area, for tabs whose content is page sections.
   */
  variant?: TabsVariant
}

/** `value` + `onValueChange` (controlled) or `defaultValue`. Arrow keys move between tabs and activate them; Home and End jump. */
export const Tabs = forwardRef<ElementRef<typeof TabsPrimitive.Root>, TabsProps>(function Tabs(
  { className, variant = 'folder', ...rest },
  ref,
) {
  return <TabsPrimitive.Root ref={ref} className={cn('kit-tabs', className)} data-variant={variant} {...rest} />
})

/** Name the list with aria-label unless a heading right above it already does. */
export const TabsList = forwardRef<ElementRef<typeof TabsPrimitive.List>, ComponentPropsWithoutRef<typeof TabsPrimitive.List>>(
  function TabsList({ className, ...rest }, ref) {
    return <TabsPrimitive.List ref={ref} className={cn('kit-tabs__list', className)} {...rest} />
  },
)

export type TabsTriggerProps = ComponentPropsWithoutRef<typeof TabsPrimitive.Trigger> & {
  /** Leading icon, decorative. */
  icon?: ReactNode
  /** Number after the label ("Saved 12"), drawn as a 20px lemon pill; read as part of the tab's name. */
  count?: number | string
}

export const TabsTrigger = forwardRef<ElementRef<typeof TabsPrimitive.Trigger>, TabsTriggerProps>(
  function TabsTrigger({ icon, count, className, children, ...rest }, ref) {
    return (
      <TabsPrimitive.Trigger ref={ref} className={cn('kit-tabs__trigger', className)} {...rest}>
        {icon}
        {children}
        {count !== undefined ? <Count value={count} variant="pill" tone="lemon" /> : null}
      </TabsPrimitive.Trigger>
    )
  },
)

export const TabsContent = forwardRef<ElementRef<typeof TabsPrimitive.Content>, ComponentPropsWithoutRef<typeof TabsPrimitive.Content>>(
  function TabsContent({ className, ...rest }, ref) {
    return <TabsPrimitive.Content ref={ref} className={cn('kit-tabs__panel', className)} {...rest} />
  },
)

import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { Tabs as TabsPrimitive } from "radix-ui"

import { cn } from "#/lib/utils"

function Tabs({
  className,
  orientation = "horizontal",
  ...props
}: React.ComponentProps<typeof TabsPrimitive.Root>) {
  return (
    <TabsPrimitive.Root
      data-slot="tabs"
      data-orientation={orientation}
      className={cn(
        "group/tabs flex gap-3 data-[orientation=horizontal]:flex-col data-[orientation=vertical]:flex-row",
        className
      )}
      {...props}
    />
  )
}

const tabsListVariants = cva(
  [
    "group/tabs-list inline-flex w-fit items-center justify-center text-muted-foreground",
    // Mobile: drop the rigid height and let the trigger's min-h-11 drive a 44px
    // touch target. Desktop: restore the denser 36px bar.
    "group-data-[orientation=horizontal]/tabs:h-auto sm:group-data-[orientation=horizontal]/tabs:h-9 group-data-[orientation=vertical]/tabs:h-fit group-data-[orientation=vertical]/tabs:flex-col",
    "data-[variant=line]:rounded-none",
  ].join(" "),
  {
    variants: {
      variant: {
        default: [
          "gap-0.5 rounded-xl border border-border/70 bg-muted/60 p-[3px]",
          "shadow-[0_1px_0_0_rgba(255,255,255,0.6)_inset,0_1px_2px_0_rgba(16,24,40,0.04)]",
          "dark:shadow-[0_1px_0_0_rgba(255,255,255,0.04)_inset]",
        ].join(" "),
        line: "gap-1 bg-transparent border-b border-border/60 p-0 rounded-none",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

function TabsList({
  className,
  variant = "default",
  ...props
}: React.ComponentProps<typeof TabsPrimitive.List> &
  VariantProps<typeof tabsListVariants>) {
  return (
    <TabsPrimitive.List
      data-slot="tabs-list"
      data-variant={variant}
      className={cn(tabsListVariants({ variant }), className)}
      {...props}
    />
  )
}

function TabsTrigger({
  className,
  ...props
}: React.ComponentProps<typeof TabsPrimitive.Trigger>) {
  return (
    <TabsPrimitive.Trigger
      data-slot="tabs-trigger"
      className={cn(
        [
          // Mobile: explicit 44px hit box via min-h-11. Desktop: original
          // h-[calc(100%-2px)] to fill the denser 36px bar.
          "relative inline-flex min-h-11 sm:h-[calc(100%-2px)] sm:min-h-0 flex-1 items-center justify-center gap-1.5 rounded-lg border border-transparent px-3 py-1 text-sm font-medium tracking-[-0.005em] whitespace-nowrap text-foreground/60",
          "transition-[background-color,color,box-shadow,transform] duration-150 ease-[cubic-bezier(0.2,0.8,0.2,1)]",
          "motion-reduce:transition-none",
          "group-data-[orientation=vertical]/tabs:w-full group-data-[orientation=vertical]/tabs:justify-start",
          "hover:text-foreground",
          "focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/45 focus-visible:outline-none",
          "disabled:pointer-events-none disabled:opacity-50",
          "dark:text-muted-foreground dark:hover:text-foreground",
          "[&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
          // default variant — pill background moves to active
          "group-data-[variant=default]/tabs-list:data-[state=active]:bg-background group-data-[variant=default]/tabs-list:data-[state=active]:text-foreground",
          "group-data-[variant=default]/tabs-list:data-[state=active]:shadow-[0_1px_0_0_rgba(255,255,255,0.6)_inset,0_1px_2px_0_rgba(16,24,40,0.06),0_8px_18px_-10px_rgba(16,24,40,0.18)]",
          "dark:group-data-[variant=default]/tabs-list:data-[state=active]:border-input dark:group-data-[variant=default]/tabs-list:data-[state=active]:bg-input/60",
          // line variant — underline
          "group-data-[variant=line]/tabs-list:bg-transparent group-data-[variant=line]/tabs-list:data-[state=active]:bg-transparent",
          "dark:group-data-[variant=line]/tabs-list:data-[state=active]:border-transparent dark:group-data-[variant=line]/tabs-list:data-[state=active]:bg-transparent",
          "group-data-[variant=line]/tabs-list:data-[state=active]:text-foreground",
          "after:absolute after:bg-primary after:opacity-0 after:transition-opacity after:duration-150",
          "group-data-[orientation=horizontal]/tabs:after:inset-x-1.5 group-data-[orientation=horizontal]/tabs:after:-bottom-[2px] group-data-[orientation=horizontal]/tabs:after:h-[2px] group-data-[orientation=horizontal]/tabs:after:rounded-full",
          "group-data-[orientation=vertical]/tabs:after:inset-y-1 group-data-[orientation=vertical]/tabs:after:-right-1 group-data-[orientation=vertical]/tabs:after:w-[2px] group-data-[orientation=vertical]/tabs:after:rounded-full",
          "group-data-[variant=line]/tabs-list:data-[state=active]:after:opacity-100",
        ].join(" "),
        className
      )}
      {...props}
    />
  )
}

function TabsContent({
  className,
  ...props
}: React.ComponentProps<typeof TabsPrimitive.Content>) {
  return (
    <TabsPrimitive.Content
      data-slot="tabs-content"
      className={cn(
        "w-full text-sm outline-none",
        "data-[state=inactive]:animate-out data-[state=inactive]:fade-out-0 data-[state=inactive]:duration-100",
        "data-[state=active]:animate-in data-[state=active]:fade-in-0 data-[state=active]:duration-150",
        "motion-reduce:animate-none",
        className
      )}
      {...props}
    />
  )
}

export { Tabs, TabsList, TabsTrigger, TabsContent, tabsListVariants }

import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { Slot } from "radix-ui"

import { cn } from "#/lib/utils"

const badgeVariants = cva(
  [
    "group/badge inline-flex h-5 w-fit shrink-0 items-center justify-center gap-1 overflow-hidden rounded-full border border-transparent bg-clip-padding px-2 py-0.5 text-[0.72rem] font-medium tracking-[-0.005em] whitespace-nowrap",
    "transition-[background-color,border-color,color,box-shadow] duration-150 ease-[cubic-bezier(0.2,0.8,0.2,1)] motion-reduce:transition-none",
    "focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/45",
    "has-data-[icon=inline-end]:pr-1.5 has-data-[icon=inline-start]:pl-1.5",
    "aria-invalid:border-destructive aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40",
    "[&>svg]:pointer-events-none [&>svg]:size-3!",
  ].join(" "),
  {
    variants: {
      variant: {
        default: [
          "bg-primary text-primary-foreground",
          "shadow-[0_1px_0_0_rgba(255,255,255,0.16)_inset]",
          "[a]:hover:bg-primary/90",
        ].join(" "),
        secondary: [
          "bg-secondary text-secondary-foreground",
          "shadow-[0_1px_0_0_rgba(255,255,255,0.45)_inset]",
          "[a]:hover:bg-secondary/85",
        ].join(" "),
        destructive: [
          "bg-destructive/10 text-destructive",
          "focus-visible:ring-destructive/25",
          "dark:bg-destructive/20",
          "[a]:hover:bg-destructive/16",
        ].join(" "),
        outline: [
          "border-border bg-background text-foreground",
          "shadow-[0_1px_0_0_rgba(255,255,255,0.5)_inset]",
          "[a]:hover:bg-muted [a]:hover:text-foreground",
          "dark:border-input dark:bg-input/30",
        ].join(" "),
        ghost: [
          "text-foreground/80",
          "hover:bg-muted hover:text-foreground dark:hover:bg-muted/50",
        ].join(" "),
        link: "text-primary underline-offset-4 hover:underline",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

function Badge({
  className,
  variant = "default",
  asChild = false,
  ...props
}: React.ComponentProps<"span"> &
  VariantProps<typeof badgeVariants> & { asChild?: boolean }) {
  const Comp = asChild ? Slot.Root : "span"

  return (
    <Comp
      data-slot="badge"
      data-variant={variant}
      className={cn(badgeVariants({ variant }), className)}
      {...props}
    />
  )
}

export { Badge, badgeVariants }

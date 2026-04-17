import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { Slot } from "radix-ui"
import { Loader2 } from "lucide-react"

import { cn } from "#/lib/utils"

const buttonVariants = cva(
  [
    // base layout + typography
    "group/button relative inline-flex shrink-0 items-center justify-center rounded-lg border border-transparent bg-clip-padding text-sm font-medium whitespace-nowrap select-none outline-none",
    // motion — tactile press, spring-like feel with Tailwind easing
    "transition-[background-color,border-color,box-shadow,color,transform] duration-150 ease-[cubic-bezier(0.2,0.8,0.2,1)]",
    "active:duration-75 active:ease-out",
    "motion-reduce:transition-none motion-reduce:active:scale-100",
    // focus ring — premium offset ring, respects the theme accent
    "focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/60 focus-visible:ring-offset-0",
    // disabled + invalid
    "disabled:pointer-events-none disabled:opacity-55",
    "aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40",
    // icon sizing — respected across variants
    "[&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
    // loading state — fades label, keeps layout stable
    "data-[loading=true]:cursor-wait data-[loading=true]:pointer-events-none",
  ].join(" "),
  {
    variants: {
      variant: {
        default: [
          // premium primary: layered shadow, top-edge highlight, active press
          "bg-primary text-primary-foreground",
          "shadow-[0_1px_0_0_rgba(255,255,255,0.12)_inset,0_1px_2px_0_rgba(12,17,29,0.10),0_8px_20px_-6px_rgba(12,17,29,0.35)]",
          "[a]:hover:bg-primary/90 hover:bg-primary/92",
          "hover:shadow-[0_1px_0_0_rgba(255,255,255,0.16)_inset,0_2px_6px_0_rgba(12,17,29,0.12),0_14px_28px_-10px_rgba(12,17,29,0.45)]",
          "active:scale-[0.985]",
        ].join(" "),
        outline: [
          "border-border bg-background text-foreground",
          "hover:bg-muted hover:text-foreground",
          "aria-expanded:bg-muted aria-expanded:text-foreground",
          "shadow-[0_1px_0_0_rgba(255,255,255,0.6)_inset,0_1px_2px_0_rgba(16,24,40,0.04)]",
          "hover:shadow-[0_1px_0_0_rgba(255,255,255,0.7)_inset,0_1px_2px_0_rgba(16,24,40,0.05),0_8px_20px_-8px_rgba(16,24,40,0.12)]",
          "active:scale-[0.985]",
          "dark:border-input dark:bg-input/30 dark:hover:bg-input/50",
        ].join(" "),
        secondary: [
          "bg-secondary text-secondary-foreground",
          "hover:bg-secondary/88",
          "aria-expanded:bg-secondary aria-expanded:text-secondary-foreground",
          "shadow-[0_1px_0_0_rgba(255,255,255,0.45)_inset,0_1px_2px_0_rgba(16,24,40,0.04)]",
          "active:scale-[0.985]",
        ].join(" "),
        ghost: [
          "text-foreground",
          "hover:bg-muted hover:text-foreground",
          "aria-expanded:bg-muted aria-expanded:text-foreground",
          "dark:hover:bg-muted/50",
        ].join(" "),
        destructive: [
          "bg-destructive/10 text-destructive",
          "hover:bg-destructive/16 hover:text-destructive",
          "focus-visible:border-destructive/40 focus-visible:ring-destructive/25",
          "shadow-[0_1px_0_0_rgba(255,255,255,0.4)_inset]",
          "active:scale-[0.985]",
          "dark:bg-destructive/20 dark:hover:bg-destructive/30 dark:focus-visible:ring-destructive/40",
        ].join(" "),
        link: "text-primary underline-offset-4 hover:underline",
      },
      size: {
        default:
          "h-8 gap-1.5 px-2.5 has-data-[icon=inline-end]:pr-2 has-data-[icon=inline-start]:pl-2",
        xs: "h-6 gap-1 rounded-[min(var(--radius-md),10px)] px-2 text-xs in-data-[slot=button-group]:rounded-lg has-data-[icon=inline-end]:pr-1.5 has-data-[icon=inline-start]:pl-1.5 [&_svg:not([class*='size-'])]:size-3",
        sm: "h-7 gap-1 rounded-[min(var(--radius-md),12px)] px-2.5 text-[0.8rem] in-data-[slot=button-group]:rounded-lg has-data-[icon=inline-end]:pr-1.5 has-data-[icon=inline-start]:pl-1.5 [&_svg:not([class*='size-'])]:size-3.5",
        lg: "h-9 gap-1.5 px-2.5 has-data-[icon=inline-end]:pr-3 has-data-[icon=inline-start]:pl-3",
        icon: "size-8",
        "icon-xs":
          "size-6 rounded-[min(var(--radius-md),10px)] in-data-[slot=button-group]:rounded-lg [&_svg:not([class*='size-'])]:size-3",
        "icon-sm":
          "size-7 rounded-[min(var(--radius-md),12px)] in-data-[slot=button-group]:rounded-lg",
        "icon-lg": "size-9",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

type ButtonProps = React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean
    loading?: boolean
  }

function Button({
  className,
  variant = "default",
  size = "default",
  asChild = false,
  loading = false,
  disabled,
  children,
  ...props
}: ButtonProps) {
  const Comp = asChild ? Slot.Root : "button"

  const content = loading ? (
    <>
      <span className="absolute inset-0 flex items-center justify-center">
        <Loader2 className="size-4 animate-spin" aria-hidden="true" />
      </span>
      <span className="opacity-0" aria-hidden="true">
        {children}
      </span>
    </>
  ) : (
    children
  )

  return (
    <Comp
      data-slot="button"
      data-variant={variant}
      data-size={size}
      data-loading={loading ? "true" : undefined}
      aria-busy={loading || undefined}
      disabled={disabled || loading}
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    >
      {content}
    </Comp>
  )
}

export { Button, buttonVariants }

import * as React from "react"

import { cn } from "#/lib/utils"

function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        [
          // layout + typography
          "flex field-sizing-content min-h-24 w-full rounded-lg border border-input bg-background px-3 py-2.5 text-base md:text-sm font-normal text-foreground leading-relaxed",
          // depth
          "shadow-[0_1px_0_0_rgba(255,255,255,0.55)_inset,0_1px_2px_0_rgba(16,24,40,0.04)]",
          "dark:shadow-[0_1px_0_0_rgba(255,255,255,0.04)_inset,0_1px_2px_0_rgba(0,0,0,0.28)]",
          // motion
          "transition-[background-color,border-color,box-shadow,color] duration-150 ease-[cubic-bezier(0.2,0.8,0.2,1)]",
          "motion-reduce:transition-none",
          // placeholder
          "placeholder:text-muted-foreground",
          // focus
          "outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/45",
          "focus-visible:shadow-[0_1px_0_0_rgba(255,255,255,0.6)_inset,0_1px_2px_0_rgba(16,24,40,0.06)]",
          // invalid
          "aria-invalid:border-destructive aria-invalid:ring-[3px] aria-invalid:ring-destructive/20 dark:aria-invalid:border-destructive/60 dark:aria-invalid:ring-destructive/40",
          // disabled
          "disabled:cursor-not-allowed disabled:bg-input/50 disabled:opacity-55",
          // dark bg
          "dark:bg-input/30 dark:disabled:bg-input/80",
          // resize handle visibility (browser default is subtle; keep it native)
          "resize-y",
          // selection
          "selection:bg-primary/20 selection:text-foreground",
        ].join(" "),
        className
      )}
      {...props}
    />
  )
}

export { Textarea }

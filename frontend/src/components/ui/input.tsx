import * as React from "react"

import { cn } from "#/lib/utils"

function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        [
          // layout + typography
          "h-9 w-full min-w-0 rounded-lg border border-input bg-background px-3 py-1.5 text-base md:text-sm font-normal text-foreground",
          // depth — subtle top highlight + ambient shadow that deepens on focus
          "shadow-[0_1px_0_0_rgba(255,255,255,0.55)_inset,0_1px_2px_0_rgba(16,24,40,0.04)]",
          "dark:shadow-[0_1px_0_0_rgba(255,255,255,0.04)_inset,0_1px_2px_0_rgba(0,0,0,0.28)]",
          // motion
          "transition-[background-color,border-color,box-shadow,color] duration-150 ease-[cubic-bezier(0.2,0.8,0.2,1)]",
          "motion-reduce:transition-none",
          // placeholder + file input
          "placeholder:text-muted-foreground",
          "file:inline-flex file:h-7 file:mr-2 file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground",
          // focus — premium 3px offset ring on accent
          "outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/45",
          "focus-visible:shadow-[0_1px_0_0_rgba(255,255,255,0.6)_inset,0_1px_2px_0_rgba(16,24,40,0.06),0_0_0_0_rgba(0,0,0,0)]",
          // invalid
          "aria-invalid:border-destructive aria-invalid:ring-[3px] aria-invalid:ring-destructive/20 dark:aria-invalid:border-destructive/60 dark:aria-invalid:ring-destructive/40",
          // disabled
          "disabled:pointer-events-none disabled:cursor-not-allowed disabled:bg-input/50 disabled:opacity-55",
          // dark theme bg
          "dark:bg-input/30 dark:disabled:bg-input/80",
          // selection
          "selection:bg-primary/20 selection:text-foreground",
        ].join(" "),
        className
      )}
      {...props}
    />
  )
}

export { Input }

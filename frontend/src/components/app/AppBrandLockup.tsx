import { cn } from '#/lib/utils'

type AppBrandLockupProps = {
  /** `full` is the mark plus the wordmark; `compact` is the mark alone. */
  mode?: 'full' | 'compact'
  className?: string
}

/**
 * The brand sticker: a tangerine tile tilted -6deg with an ink check. Same artwork as /favicon.svg.
 * The tile, outline and shadow are CSS (tokens), so the mark scales with `--cw-brand-mark-size`.
 */
export function BrandMark({ title, className }: { title?: string; className?: string }) {
  return (
    <span
      className={cn('cw-brand-mark', className)}
      role={title ? 'img' : undefined}
      aria-label={title}
      aria-hidden={title ? undefined : true}
    >
      <svg viewBox="0 0 24 24" focusable="false" aria-hidden="true">
        <path d="M5 12.5l4.5 4.5L19 7" />
      </svg>
    </span>
  )
}

export function AppBrandLockup({
  mode = 'full',
  className,
}: AppBrandLockupProps) {
  const isCompact = mode === 'compact'

  return (
    <div
      className={cn('cw-brand-lockup', className)}
      data-brand-mode={mode}
    >
      <BrandMark title={isCompact ? 'Career Workbench' : undefined} />
      {isCompact ? null : <span className="cw-brand-wordmark">Career Workbench</span>}
    </div>
  )
}

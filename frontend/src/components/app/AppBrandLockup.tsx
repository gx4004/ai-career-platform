import compactMark from '#/assets/branding/career-workbench-mark.webp'
import fullWordmark from '#/assets/branding/career-workbench-wordmark.webp'
import { cn } from '#/lib/utils'

type AppBrandLockupProps = {
  mode?: 'full' | 'compact'
  className?: string
}

export function AppBrandLockup({
  mode = 'full',
  className,
}: AppBrandLockupProps) {
  const isCompact = mode === 'compact'

  return (
    <div
      className={cn(
        'cw-brand-lockup',
        isCompact ? 'cw-brand-lockup--compact' : 'cw-brand-lockup--full',
        className,
      )}
      data-brand-mode={mode}
    >
      <img
        src={isCompact ? compactMark : fullWordmark}
        alt="Career Workbench"
        className={isCompact ? 'cw-brand-mark' : 'cw-brand-wordmark'}
        width={isCompact ? 299 : 600}
        height={isCompact ? 299 : 113}
        loading="eager"
        fetchPriority="high"
        decoding="async"
      />
    </div>
  )
}

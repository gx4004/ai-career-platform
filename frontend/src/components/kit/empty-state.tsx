import { forwardRef, type ComponentPropsWithoutRef, type ReactNode } from 'react'
import { Button } from './button'
import { cn } from '#/lib/utils'

export type StateSize = 'compact' | 'page'

type StateBaseProps = Omit<ComponentPropsWithoutRef<'div'>, 'title'> & {
  /** compact: inside a Section or beside content. page: the whole page has nothing to show. Default compact. */
  size?: StateSize
  /** Level of the title heading. Omit for a plain paragraph. */
  headingLevel?: 2 | 3 | 4 | 5 | 6
}

export type EmptyStateProps = StateBaseProps & {
  /** One serif line: what is missing, in plain words ("No applications yet"). */
  title: ReactNode
  /** One sentence on what to do about it. */
  description?: ReactNode
  /** At most one action: a Button (secondary, or primary on a page-level empty state). */
  action?: ReactNode
}

function Title({ headingLevel, className, children }: { headingLevel?: number; className: string; children: ReactNode }) {
  const Heading = (headingLevel ? `h${headingLevel}` : 'p') as 'p'
  return <Heading className={className}>{children}</Heading>
}

/**
 * Nothing here yet: a serif line, one sentence, at most one action. Left-aligned, no illustration, no
 * icon. Replaces .camp-empty, .dash-empty, .today-empty, .history-empty, .profile-empty, WorkspaceEmpty,
 * .cvs-empty-panel and the other empty-state variants.
 */
export const EmptyState = forwardRef<HTMLDivElement, EmptyStateProps>(function EmptyState(
  { title, description, action, size = 'compact', headingLevel, className, ...rest },
  ref,
) {
  return (
    <div ref={ref} className={cn('kit-empty', className)} data-size={size} {...rest}>
      <Title headingLevel={headingLevel} className="kit-empty__title">
        {title}
      </Title>
      {description ? <p className="kit-empty__text">{description}</p> : null}
      {action ? <div className="kit-empty__action">{action}</div> : null}
    </div>
  )
})

export type ErrorStateProps = StateBaseProps & {
  /** What failed, in plain words ("Your applications couldn't be loaded"). */
  title: ReactNode
  /** What it means or what to try, one sentence. */
  description?: ReactNode
  /** A short code or status shown quietly above the title ("404", "Not found"). */
  code?: ReactNode
  /** Technical detail (request id, message) in a small monospace line. */
  detail?: ReactNode
  /** Adds a "Try again" button. The page re-runs the thing that failed. */
  onRetry?: () => void
  retryLabel?: string
  /** Spinner on the retry button while the retry runs. */
  retrying?: boolean
  /** A secondary way out: a Button asChild with a Link ("All applications"). */
  backAction?: ReactNode
  /** alert (default) announces it; status for a calm not-found page; none leaves it silent. */
  role?: 'alert' | 'status' | 'none'
}

/**
 * Something failed: what failed, why if known, then retry and/or a way back. Same shape as
 * EmptyState. Replaces AppStatePanel-style screens, .state-page, .camp-alert, .history-alert and loose error lines.
 */
export const ErrorState = forwardRef<HTMLDivElement, ErrorStateProps>(function ErrorState(
  {
    title,
    description,
    code,
    detail,
    onRetry,
    retryLabel = 'Try again',
    retrying = false,
    backAction,
    size = 'compact',
    headingLevel,
    role = 'alert',
    className,
    ...rest
  },
  ref,
) {
  const hasActions = Boolean(onRetry) || Boolean(backAction)
  return (
    <div
      ref={ref}
      role={role === 'none' ? undefined : role}
      className={cn('kit-empty kit-error', className)}
      data-size={size}
      {...rest}
    >
      {code ? <p className="kit-error__code">{code}</p> : null}
      <Title headingLevel={headingLevel} className="kit-empty__title">
        {title}
      </Title>
      {description ? <p className="kit-empty__text">{description}</p> : null}
      {detail ? <p className="kit-error__detail">{detail}</p> : null}
      {hasActions ? (
        <div className="kit-empty__action kit-error__actions">
          {onRetry ? (
            <Button type="button" variant="secondary" loading={retrying} onClick={onRetry}>
              {retryLabel}
            </Button>
          ) : null}
          {backAction}
        </div>
      ) : null}
    </div>
  )
})

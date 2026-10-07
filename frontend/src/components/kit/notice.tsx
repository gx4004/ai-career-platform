import { forwardRef, type ComponentPropsWithoutRef, type ReactNode } from 'react'
import { AlertCircle, AlertTriangle, CheckCircle2, Info, X } from 'lucide-react'
import { cn } from '#/lib/utils'
import { Button } from './button'

export type NoticeTone = 'info' | 'success' | 'warning' | 'danger'

const ICONS: Record<NoticeTone, ReactNode> = {
  info: <Info aria-hidden="true" />,
  success: <CheckCircle2 aria-hidden="true" />,
  warning: <AlertTriangle aria-hidden="true" />,
  danger: <AlertCircle aria-hidden="true" />,
}

export type NoticeProps = Omit<ComponentPropsWithoutRef<'div'>, 'title'> & {
  /** info is neutral stone (there is no blue). Default info. */
  tone?: NoticeTone
  /** Bold first line; the children are the detail. */
  title?: ReactNode
  /** Replaces the tone's icon; false hides it. The icon is decoration: say what happened in words. */
  icon?: ReactNode | false
  /** One action at the end of the strip: a Button size="sm" variant="secondary" or a link. */
  action?: ReactNode
  /**
   * Where the action sits. end (default): beside the text, dropping under it on a phone. below: on its own
   * line under the text at every width, aligned with it, and spanning the notice under 480px. Use below for
   * a choice of two buttons (pass both as the action), which beside the text would squeeze it.
   */
  actionPlacement?: 'end' | 'below'
  /** Shows a close button that calls this. */
  onDismiss?: () => void
  dismissLabel?: string
}

/**
 * An inline strip: a message that belongs to the page, not to an overlay. danger is announced as an
 * alert, the other tones as a status; override with `role`. Replaces the guest-save and hand-off
 * banners, .result-notice, .tool-notice, .camp-alert, .history-alert, .disc-error and loose error text.
 */
export const Notice = forwardRef<HTMLDivElement, NoticeProps>(function Notice(
  { tone = 'info', title, icon, action, actionPlacement = 'end', onDismiss, dismissLabel = 'Dismiss', role, className, children, ...rest },
  ref,
) {
  const glyph = icon === undefined ? ICONS[tone] : icon
  return (
    <div
      ref={ref}
      role={role ?? (tone === 'danger' ? 'alert' : 'status')}
      className={cn('kit-notice', className)}
      data-tone={tone}
      data-action-placement={action && actionPlacement === 'below' ? 'below' : undefined}
      {...rest}
    >
      {glyph ? <span className="kit-notice__icon">{glyph}</span> : null}
      <div className="kit-notice__body">
        {title ? <p className="kit-notice__title">{title}</p> : null}
        {children ? <div className="kit-notice__text">{children}</div> : null}
      </div>
      {action ? <div className="kit-notice__action">{action}</div> : null}
      {onDismiss ? (
        <Button type="button" iconOnly variant="ghost" size="sm" className="kit-notice__dismiss" aria-label={dismissLabel} onClick={onDismiss}>
          <X aria-hidden="true" />
        </Button>
      ) : null}
    </div>
  )
})

import { AlertTriangle } from 'lucide-react'
import { AppStatePanel } from '#/components/app/AppStatePanel'

export function AppRouteError({
  error,
  reset,
}: {
  error: Error
  reset: () => void
}) {
  return (
    <AppStatePanel
      badge="Route error"
      scene="emptyPlanning"
      icon={<AlertTriangle size={48} style={{ color: 'var(--warning)' }} />}
      title="This route failed to load"
      description="A rendering or data-loading error interrupted the page."
      detail={error.message}
      actions={[
        { label: 'Try again', onClick: reset },
        { label: 'Go to dashboard', to: '/dashboard', variant: 'outline' },
      ]}
    />
  )
}

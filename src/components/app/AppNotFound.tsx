import { SearchX } from 'lucide-react'
import { AppStatePanel } from '#/components/app/AppStatePanel'

export function AppNotFound() {
  return (
    <AppStatePanel
      badge="404"
      scene="emptyPlanning"
      icon={<SearchX size={48} style={{ color: 'var(--text-muted)' }} />}
      title="Page not found"
      description="The page you requested does not exist in this workspace."
      actions={[
        { label: 'Go to dashboard', to: '/dashboard' },
        { label: 'Back to landing', to: '/', variant: 'outline' },
      ]}
    />
  )
}

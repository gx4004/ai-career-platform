import { AppStatePanel } from '#/components/app/AppStatePanel'

export function AppNotFound() {
  return (
    <AppStatePanel
      badge="404"
      title="Page not found"
      description="This page does not exist in your workspace."
      actions={[
        { label: 'Go to dashboard', to: '/dashboard' },
        { label: 'Back to home', to: '/', variant: 'outline' },
      ]}
    />
  )
}

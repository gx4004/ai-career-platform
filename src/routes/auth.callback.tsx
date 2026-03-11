import { createFileRoute } from '@tanstack/react-router'
import { AppStatePanel } from '#/components/app/AppStatePanel'

export const Route = createFileRoute('/auth/callback')({
  component: AuthCallbackPage,
})

function AuthCallbackPage() {
  return (
    <AppStatePanel
      badge="OAuth callback"
      scene="emptyPlanning"
      title="Social sign-in coming soon"
      description="Social login providers will be available in a future update. Use email sign-in for now."
      actions={[
        { label: 'Go to login', to: '/login' },
        { label: 'Open dashboard', to: '/dashboard', variant: 'outline' },
      ]}
    />
  )
}

import { createFileRoute } from '@tanstack/react-router'
import { AppStatePanel } from '#/components/app/AppStatePanel'

export const Route = createFileRoute('/auth/callback')({
  head: () => ({
    meta: [{ title: 'Authenticating… | Career Workbench' }],
  }),
  component: AuthCallbackPage,
})

export function AuthCallbackPage() {
  return (
    <AppStatePanel
      badge="OAuth callback"
      scene="emptyPlanning"
      title="No external sign-in provider is configured"
      description="Use email sign-in to access your workspace, or continue in guest demo mode if you only want to explore the tools."
      actions={[
        { label: 'Go to login', to: '/login' },
        { label: 'Continue as guest', to: '/dashboard', variant: 'outline' },
      ]}
    />
  )
}

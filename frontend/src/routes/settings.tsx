import { createFileRoute, lazyRouteComponent } from '@tanstack/react-router'

export const Route = createFileRoute('/settings')({
  head: () => ({
    meta: [{ title: 'Settings | Career Workbench' }],
  }),
  component: lazyRouteComponent(() => import('#/pages/settings-page'), 'SettingsPage'),
})

import { createFileRoute, lazyRouteComponent } from '@tanstack/react-router'

export const Route = createFileRoute('/profile')({
  head: () => ({
    meta: [{ title: 'Evidence Profile | Career Workbench' }],
  }),
  component: lazyRouteComponent(() => import('#/pages/profile-page'), 'ProfilePage'),
})

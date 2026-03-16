import { createFileRoute, lazyRouteComponent } from '@tanstack/react-router'

export const Route = createFileRoute('/account')({
  head: () => ({
    meta: [{ title: 'Account | Career Workbench' }],
  }),
  component: lazyRouteComponent(() => import('#/pages/account-page'), 'AccountPage'),
})

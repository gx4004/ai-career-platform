import { createFileRoute, lazyRouteComponent } from '@tanstack/react-router'

export const Route = createFileRoute('/cookies')({
  head: () => ({
    meta: [{ title: 'Cookie Policy | Career Workbench' }],
  }),
  component: lazyRouteComponent(() => import('#/pages/legal/CookiePolicyPage'), 'CookiePolicyPage'),
})

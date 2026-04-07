import { createFileRoute, lazyRouteComponent } from '@tanstack/react-router'

export const Route = createFileRoute('/terms')({
  head: () => ({
    meta: [{ title: 'Terms of Service | Career Workbench' }],
  }),
  component: lazyRouteComponent(() => import('#/pages/legal/TermsOfServicePage'), 'TermsOfServicePage'),
})

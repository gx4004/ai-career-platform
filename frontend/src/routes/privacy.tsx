import { createFileRoute, lazyRouteComponent } from '@tanstack/react-router'

export const Route = createFileRoute('/privacy')({
  head: () => ({
    meta: [{ title: 'Privacy Policy | Career Workbench' }],
  }),
  component: lazyRouteComponent(() => import('#/pages/legal/PrivacyPolicyPage'), 'PrivacyPolicyPage'),
})

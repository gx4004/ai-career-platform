import { createFileRoute, lazyRouteComponent } from '@tanstack/react-router'

export const Route = createFileRoute('/admin/activation')({
  head: () => ({
    meta: [{ title: 'Activation | Admin | Career Workbench' }],
  }),
  component: lazyRouteComponent(
    () => import('#/pages/admin/admin-activation-page'),
    'AdminActivationPage',
  ),
})

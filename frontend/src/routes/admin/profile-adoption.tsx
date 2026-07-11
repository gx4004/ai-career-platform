import { createFileRoute, lazyRouteComponent } from '@tanstack/react-router'

export const Route = createFileRoute('/admin/profile-adoption')({
  head: () => ({
    meta: [{ title: 'Profile Adoption | Admin | Career Workbench' }],
  }),
  component: lazyRouteComponent(
    () => import('#/pages/admin/admin-profile-adoption-page'),
    'AdminProfileAdoptionPage',
  ),
})

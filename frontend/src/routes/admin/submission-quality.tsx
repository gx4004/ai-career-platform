import { createFileRoute, lazyRouteComponent } from '@tanstack/react-router'

export const Route = createFileRoute('/admin/submission-quality')({
  head: () => ({
    meta: [{ title: 'Submission Quality | Admin | Career Workbench' }],
  }),
  component: lazyRouteComponent(
    () => import('#/pages/admin/admin-submission-quality-page'),
    'AdminSubmissionQualityPage',
  ),
})

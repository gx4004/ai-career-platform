import { createFileRoute, lazyRouteComponent } from '@tanstack/react-router'

export const Route = createFileRoute('/landing-tools')({
  head: () => ({
    meta: [{ title: 'Six Tools | Career Workbench' }],
  }),
  component: lazyRouteComponent(
    () => import('#/pages/landing-tools-preview-page'),
    'LandingToolsPreviewPage',
  ),
})


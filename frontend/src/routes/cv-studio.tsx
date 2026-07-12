import { createFileRoute, lazyRouteComponent } from '@tanstack/react-router'

export const Route = createFileRoute('/cv-studio')({
  head: () => ({ meta: [{ title: 'CV Studio | Career Workbench' }] }),
  component: lazyRouteComponent(() => import('#/pages/cv-studio-page'), 'CvStudioPage'),
})

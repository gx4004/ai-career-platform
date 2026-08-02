import { createFileRoute, lazyRouteComponent } from '@tanstack/react-router'
import { isR12CvStudioEnabled } from '#/lib/flags/featureFlags'
import { requireEnabledOutcome } from '#/lib/flags/outcomeGuard'

export const Route = createFileRoute('/cv-studio')({
  beforeLoad: () => requireEnabledOutcome(isR12CvStudioEnabled()),
  head: () => ({ meta: [{ title: 'CV Studio | Career Workbench' }] }),
  component: lazyRouteComponent(() => import('#/pages/cv-studio-page'), 'CvStudioPage'),
})

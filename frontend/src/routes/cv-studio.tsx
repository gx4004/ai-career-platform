import { createFileRoute, lazyRouteComponent } from '@tanstack/react-router'
import { isR12CvStudioEnabled } from '#/lib/flags/featureFlags'
import { requireEnabledOutcome } from '#/lib/flags/outcomeGuard'

// The live paper preview uses the exact bundled OFL faces the PDF/DOCX
// renderer uses, served by the API itself (@font-face rules in
// styles/cv-studio.css) instead of pulling different files from Google
// Fonts (#322).

export const Route = createFileRoute('/cv-studio')({
  beforeLoad: () => requireEnabledOutcome(isR12CvStudioEnabled()),
  head: () => ({
    meta: [{ title: 'CV Studio | Career Workbench' }],
  }),
  component: lazyRouteComponent(() => import('#/pages/cv-studio-page'), 'CvStudioPage'),
})

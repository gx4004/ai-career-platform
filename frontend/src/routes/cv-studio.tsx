import { createFileRoute, lazyRouteComponent } from '@tanstack/react-router'
import { isR12CvStudioEnabled } from '#/lib/flags/featureFlags'
import { requireEnabledOutcome } from '#/lib/flags/outcomeGuard'

// The live paper preview mirrors the PDF's bundled OFL families; these are the
// same families from Google Fonts (the backend does not serve its font files).
const CV_PREVIEW_FONTS =
  'https://fonts.googleapis.com/css2?family=Crimson+Text:wght@400;700&family=IBM+Plex+Mono:wght@400;700&family=Lato:wght@400;700&family=PT+Sans:wght@400;700&family=PT+Serif:wght@400;700&display=swap'

export const Route = createFileRoute('/cv-studio')({
  beforeLoad: () => requireEnabledOutcome(isR12CvStudioEnabled()),
  head: () => ({
    meta: [{ title: 'CV Studio | Career Workbench' }],
    links: [
      { rel: 'preconnect', href: 'https://fonts.googleapis.com' },
      { rel: 'preconnect', href: 'https://fonts.gstatic.com', crossOrigin: 'anonymous' },
      { rel: 'stylesheet', href: CV_PREVIEW_FONTS },
    ],
  }),
  component: lazyRouteComponent(() => import('#/pages/cv-studio-page'), 'CvStudioPage'),
})

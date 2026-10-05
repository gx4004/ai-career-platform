import { createFileRoute, lazyRouteComponent } from '@tanstack/react-router'

const TITLE = 'Career Workbench: find your resume’s blind spots'
const DESCRIPTION =
  'Upload your resume and see what is working, what is not, and what to fix first. Six connected tools from resume review to interview prep, free to try with no account.'

/**
 * Where this deployment lives, for the absolute URLs link previews need (og:url, og:image, canonical).
 * Unset means the app only runs locally, so the tags fall back to root-relative paths.
 */
function siteUrl(path: string) {
  const origin = (import.meta.env.VITE_SITE_URL as string | undefined)?.trim().replace(/\/+$/, '') ?? ''
  return `${origin}${path}`
}

export const Route = createFileRoute('/')({
  head: () => ({
    meta: [
      { title: TITLE },
      { name: 'description', content: DESCRIPTION },
      { property: 'og:site_name', content: 'Career Workbench' },
      { property: 'og:title', content: TITLE },
      { property: 'og:description', content: DESCRIPTION },
      { property: 'og:url', content: siteUrl('/') },
      { property: 'og:image', content: siteUrl('/og-image.png') },
      { property: 'og:image:width', content: '1200' },
      { property: 'og:image:height', content: '630' },
      {
        property: 'og:image:alt',
        content: 'An example Resume Analyzer result: a score of 84 out of 100 on a tangerine seal.',
      },
      { name: 'twitter:card', content: 'summary_large_image' },
      { name: 'twitter:title', content: TITLE },
      { name: 'twitter:description', content: DESCRIPTION },
      { name: 'twitter:image', content: siteUrl('/og-image.png') },
    ],
    links: [{ rel: 'canonical', href: siteUrl('/') }],
  }),
  component: lazyRouteComponent(
    () => import('#/pages/landing-experiment-page'),
    'LandingExperimentPage',
  ),
})

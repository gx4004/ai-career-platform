import { describe, expect, it, vi } from 'vitest'
import { Route } from '#/routes/index'

vi.mock('@tanstack/react-router', () => ({
  createFileRoute: () => (options: unknown) => options,
}))

// The route imports the page directly (TanStack's autoCodeSplitting splits `component` into its own chunk).
vi.mock('#/pages/landing-experiment-page', () => ({ LandingExperimentPage: 'LandingExperimentPage' }))

describe('landing index route', () => {
  const route = Route as unknown as {
    component: string
    validateSearch?: unknown
    head: () => {
      meta: Array<Record<string, string>>
      links: Array<Record<string, string>>
    }
  }

  it('loads the production landing page', () => {
    expect(route.component).toBe('LandingExperimentPage')
    expect(route.validateSearch).toBeUndefined()
  })

  it('ships a share preview: og:image, og:url, a large twitter card and a canonical link', () => {
    const { meta, links } = route.head()
    const byProp = (key: string, value: string) => meta.find((m) => m[key] === value)?.content
    expect(byProp('property', 'og:image')).toMatch(/og-image\.png$/)
    expect(byProp('property', 'og:url')).toBeTruthy()
    expect(byProp('property', 'og:image:width')).toBe('1200')
    expect(byProp('property', 'og:image:height')).toBe('630')
    expect(byProp('name', 'twitter:card')).toBe('summary_large_image')
    expect(meta.find((m) => 'title' in m)?.title).toMatch(/Career Workbench/)
    expect(links.find((l) => l.rel === 'canonical')?.href).toBeTruthy()
  })
})

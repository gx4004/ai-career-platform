import { describe, expect, it, vi } from 'vitest'
import { Route } from '#/routes/index'

vi.mock('@tanstack/react-router', () => ({
  createFileRoute: () => (options: unknown) => options,
  lazyRouteComponent: () => 'LandingExperimentPage',
}))

describe('landing index route', () => {
  const route = Route as unknown as {
    component: string
    validateSearch?: unknown
  }

  it('loads the production landing page', () => {
    expect(route.component).toBe('LandingExperimentPage')
    expect(route.validateSearch).toBeUndefined()
  })
})

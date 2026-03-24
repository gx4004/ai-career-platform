import { describe, expect, it, vi } from 'vitest'
import { Route } from '#/routes/landing-experiment'

vi.mock('@tanstack/react-router', () => ({
  createFileRoute: () => (options: unknown) => options,
  redirect: (opts: unknown) => opts,
}))

describe('landing experiment route', () => {
  const route = Route as unknown as {
    beforeLoad: () => never
  }

  it('redirects to the root landing page', () => {
    expect(() => route.beforeLoad()).toThrow()
  })
})

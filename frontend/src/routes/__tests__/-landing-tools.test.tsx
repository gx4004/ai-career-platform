import { describe, expect, it, vi } from 'vitest'
import { Route } from '#/routes/landing-tools'

vi.mock('@tanstack/react-router', () => ({
  createFileRoute: () => (options: unknown) => options,
  lazyRouteComponent: () => 'LandingToolsPreviewPage',
}))

describe('landing tools route', () => {
  const route = Route as unknown as {
    head: () => { meta?: Array<{ title?: string }> }
    component: string
  }

  it('loads the standalone six-tools preview page', () => {
    expect(route.component).toBe('LandingToolsPreviewPage')
    expect(route.head().meta?.[0]?.title).toBe('Six Tools | Career Workbench')
  })
})

import { describe, expect, it, vi } from 'vitest'
import { Route } from '#/routes/queue'

vi.mock('@tanstack/react-router', () => ({
  createFileRoute: () => (options: unknown) => options,
  lazyRouteComponent: () => 'QueuePage',
}))

describe('/queue route', () => {
  const route = Route as unknown as { ssr?: boolean; component: string }

  // A signed-in user reloading /queue must not be bounced to /login: the auth
  // guard reads the session cookie, which only exists in the browser, so this
  // route must never run its beforeLoad during server rendering.
  it('disables SSR so the auth guard only ever runs client-side', () => {
    expect(route.ssr).toBe(false)
  })

  it('loads the queue page', () => {
    expect(route.component).toBe('QueuePage')
  })
})

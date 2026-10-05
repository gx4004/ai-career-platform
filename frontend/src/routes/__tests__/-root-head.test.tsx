import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('@tanstack/react-router', () => ({
  createRootRoute: (options: unknown) => options,
  HeadContent: () => null,
  Outlet: () => null,
  Scripts: () => null,
}))
vi.mock('#/lib/i18n', () => ({}))
vi.mock('#/components/app/AppNotFound', () => ({ AppNotFound: () => null }))
vi.mock('#/components/app/AppRouteError', () => ({ AppRouteError: () => null }))
vi.mock('#/components/app/AppShell', () => ({ AppShell: () => null }))
vi.mock('#/components/app/CookieConsent', () => ({ CookieConsent: () => null }))
vi.mock('#/lib/auth/session', () => ({ SessionProvider: () => null }))

type Head = { meta: Array<Record<string, string>>; links: Array<Record<string, string>> }

async function head(pathname: string): Promise<Head> {
  const { Route } = await import('#/routes/__root')
  return (Route as unknown as { head: (ctx: unknown) => Head }).head({ matches: [{ pathname: '/' }, { pathname }] })
}

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('root head', () => {
  it('links the v5 icons', async () => {
    const { links } = await head('/dashboard')
    const icons = links.filter((l) => l.rel === 'icon' || l.rel === 'apple-touch-icon')
    expect(icons.length).toBeGreaterThan(0)
    for (const icon of icons) expect(icon.href).toMatch(/\?v=5$/)
  })

  it('types the legal pages as articles and everything else as a website', async () => {
    const type = async (path: string) => (await head(path)).meta.find((m) => m.property === 'og:type')?.content
    expect(await type('/privacy')).toBe('article')
    expect(await type('/terms')).toBe('article')
    expect(await type('/dashboard')).toBe('website')
    expect(await type('/')).toBe('website')
  })

  it('adds a canonical link for public pages only when VITE_SITE_URL is set', async () => {
    expect((await head('/privacy')).links.find((l) => l.rel === 'canonical')).toBeUndefined()
    vi.stubEnv('VITE_SITE_URL', 'https://example.test/')
    expect((await head('/privacy')).links.find((l) => l.rel === 'canonical')?.href).toBe('https://example.test/privacy')
    // The landing route ships its own canonical; private pages get none.
    expect((await head('/')).links.find((l) => l.rel === 'canonical')).toBeUndefined()
    expect((await head('/dashboard')).links.find((l) => l.rel === 'canonical')).toBeUndefined()
  })
})

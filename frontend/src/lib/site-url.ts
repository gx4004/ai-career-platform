/**
 * Where this deployment lives, for the absolute URLs link previews and crawlers need (og:url, canonical).
 * VITE_SITE_URL unset means the app only runs locally: callers get root-relative paths and skip the canonical link.
 */
export function siteOrigin(): string {
  return ((import.meta.env.VITE_SITE_URL as string | undefined) ?? '').trim().replace(/\/+$/, '')
}

export function siteUrl(path: string): string {
  return `${siteOrigin()}${path}`
}

/** The public pages a crawler may index; /_kit and everything behind sign-in are left out. */
export const INDEXABLE_PATHS = ['/', '/login', '/privacy', '/terms', '/cookies', '/imprint'] as const

/** Long-form reading pages: og:type article. Everything else is a website. */
export const ARTICLE_PATHS: ReadonlySet<string> = new Set(['/privacy', '/terms', '/cookies', '/imprint'])

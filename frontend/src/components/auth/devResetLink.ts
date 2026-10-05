/**
 * In development the backend has no mail key, so it may hand back the reset link itself (`dev_reset_url`).
 * Only a link to this site's own reset page is ever offered; anything else is dropped.
 */
export function devResetPath(result: unknown): string | null {
  const raw = (result as { dev_reset_url?: unknown } | null)?.dev_reset_url
  if (typeof raw !== 'string' || typeof window === 'undefined') return null
  try {
    const url = new URL(raw, window.location.origin)
    const sameSite = url.origin === window.location.origin || ['localhost', '127.0.0.1'].includes(url.hostname)
    if (!sameSite || url.pathname !== '/reset-password') return null
    return `${url.pathname}${url.hash}`
  } catch {
    return null
  }
}

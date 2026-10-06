export function navigateToPath(to: string) {
  window.location.assign(to)
}

const PROBE_ORIGIN = 'https://career-workbench.invalid'

function hasUnsafeCharacter(text: string): boolean {
  for (const char of text) {
    const code = char.charCodeAt(0)
    if (code < 0x20 || code === 0x7f || char === '\\') return true
  }
  return false
}

/**
 * A place inside this app that is safe to send someone after sign-in, or null. Only same-origin paths are
 * kept (no scheme, no protocol-relative or backslash tricks, no control characters, nothing that decodes to
 * one of those), and never the sign-in page itself, which would strand the person where they started.
 */
export function safeInternalPath(value: unknown): string | null {
  if (typeof value !== 'string' || !value.startsWith('/') || value.startsWith('//')) return null
  if (hasUnsafeCharacter(value)) return null

  let decoded: string
  try {
    decoded = decodeURIComponent(value)
  } catch {
    return null
  }
  if (decoded.startsWith('//') || hasUnsafeCharacter(decoded)) return null

  let url: URL
  try {
    url = new URL(value, PROBE_ORIGIN)
  } catch {
    return null
  }
  if (url.origin !== PROBE_ORIGIN) return null
  // Dot segments are resolved only now ('/..//evil.example' becomes '//evil.example'): check the result too.
  if (url.pathname.startsWith('//') || url.pathname.startsWith('/\\')) return null
  if (url.pathname === '/login' || url.pathname.startsWith('/login/')) return null
  return `${url.pathname}${url.search}${url.hash}`
}

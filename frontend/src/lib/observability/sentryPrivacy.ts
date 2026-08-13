type SentryEventLike = {
  request?: {
    data?: unknown
    cookies?: unknown
    query_string?: unknown
    url?: string
    headers?: Record<string, string>
  }
  user?: {
    email?: string | null
    ip_address?: string | null
  }
  message?: string
  logentry?: unknown
  contexts?: unknown
  extra?: unknown
  breadcrumbs?: unknown
  exception?: {
    values?: Array<{
      type?: string
      value?: string
      stacktrace?: { frames?: Array<{ vars?: unknown; [key: string]: unknown }> }
    }>
  }
}

type SentryBreadcrumbLike = {
  category?: string
  message?: string
  data?: Record<string, unknown>
}

export const SENTRY_TRACES_SAMPLE_RATE = 0

function stripQuery(value: string): string {
  const cuts = ['?', '#']
    .map((character) => value.indexOf(character))
    .filter((index) => index >= 0)
  return cuts.length ? value.slice(0, Math.min(...cuts)) : value
}

export function scrubSentryEvent<T>(event: T): T {
  const scrubbed = event as SentryEventLike
  if (scrubbed.request) {
    delete scrubbed.request.data
    delete scrubbed.request.cookies
    delete scrubbed.request.query_string
    if (typeof scrubbed.request.url === 'string') {
      scrubbed.request.url = stripQuery(scrubbed.request.url)
    }
    const headers = scrubbed.request.headers
    if (headers) {
      for (const key of Object.keys(headers)) {
        if (/^(authorization|cookie|set-cookie|x-csrf-token)$/i.test(key)) {
          headers[key] = '[scrubbed]'
        }
      }
    }
  }
  delete scrubbed.user
  delete scrubbed.message
  delete scrubbed.logentry
  delete scrubbed.contexts
  delete scrubbed.extra
  delete scrubbed.breadcrumbs
  for (const value of scrubbed.exception?.values ?? []) {
    value.value = '[scrubbed]'
    for (const frame of value.stacktrace?.frames ?? []) delete frame.vars
  }
  return event
}

export function scrubSentryBreadcrumb<T extends SentryBreadcrumbLike>(
  breadcrumb: T,
): T {
  delete breadcrumb.message
  delete breadcrumb.data
  return breadcrumb
}

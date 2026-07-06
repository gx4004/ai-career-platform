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
}

type SentryBreadcrumbLike = {
  category?: string
  message?: string
  data?: Record<string, unknown>
}

function stripQuery(value: string): string {
  const cuts = ['?', '#']
    .map((character) => value.indexOf(character))
    .filter((index) => index >= 0)
  return cuts.length ? value.slice(0, Math.min(...cuts)) : value
}

export function scrubSentryEvent<T extends SentryEventLike>(event: T): T {
  if (event.request) {
    delete event.request.data
    delete event.request.cookies
    delete event.request.query_string
    if (typeof event.request.url === 'string') {
      event.request.url = stripQuery(event.request.url)
    }
    const headers = event.request.headers
    if (headers) {
      for (const key of Object.keys(headers)) {
        if (/^(authorization|cookie|set-cookie|x-csrf-token)$/i.test(key)) {
          headers[key] = '[scrubbed]'
        }
      }
    }
  }
  delete event.user
  return event
}

export function scrubSentryBreadcrumb<T extends SentryBreadcrumbLike>(
  breadcrumb: T,
): T {
  if (breadcrumb.data) {
    for (const key of ['url', 'from', 'to'] as const) {
      const value = breadcrumb.data[key]
      if (typeof value === 'string') breadcrumb.data[key] = stripQuery(value)
    }
    if (breadcrumb.category === 'fetch' || breadcrumb.category === 'xhr') {
      delete breadcrumb.data.body
      delete breadcrumb.data.request_body
      delete breadcrumb.data.response_body
    }
  }
  if (typeof breadcrumb.message === 'string') {
    breadcrumb.message = stripQuery(breadcrumb.message)
  }
  return breadcrumb
}

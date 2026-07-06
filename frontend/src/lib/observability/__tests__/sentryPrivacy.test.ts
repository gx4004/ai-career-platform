import { describe, expect, it } from 'vitest'
import {
  scrubSentryBreadcrumb,
  scrubSentryEvent,
} from '#/lib/observability/sentryPrivacy'

describe('frontend Sentry privacy hooks', () => {
  it('removes request content, credentials, query strings, and user PII', () => {
    const event = scrubSentryEvent({
      request: {
        url: 'https://example.com/reset-password?token=secret#fragment',
        data: { resume_text: 'private resume' },
        cookies: { cw_access: 'secret-cookie' },
        query_string: 'token=secret',
        headers: {
          Authorization: 'Bearer secret',
          Cookie: 'cw_access=secret',
          'Content-Type': 'application/json',
        },
      },
      user: {
        id: 'opaque-user-id',
        email: 'user@example.com',
        ip_address: '192.0.2.1',
      },
    })

    expect(event.request?.url).toBe('https://example.com/reset-password')
    expect(event.request?.data).toBeUndefined()
    expect(event.request?.cookies).toBeUndefined()
    expect(event.request?.query_string).toBeUndefined()
    expect(event.request?.headers?.Authorization).toBe('[scrubbed]')
    expect(event.request?.headers?.Cookie).toBe('[scrubbed]')
    expect(event.request?.headers?.['Content-Type']).toBe('application/json')
    expect(event.user).toBeUndefined()
  })

  it('removes fetch bodies and strips breadcrumb URL queries', () => {
    const breadcrumb = scrubSentryBreadcrumb({
      category: 'fetch',
      message: '/api/v1/tools?token=secret',
      data: {
        url: 'https://api.example.com/path?token=secret',
        request_body: 'private resume',
        response_body: 'private generated result',
      },
    })

    expect(breadcrumb.message).toBe('/api/v1/tools')
    expect(breadcrumb.data?.url).toBe('https://api.example.com/path')
    expect(breadcrumb.data?.request_body).toBeUndefined()
    expect(breadcrumb.data?.response_body).toBeUndefined()
  })
})

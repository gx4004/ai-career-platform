import { describe, expect, it } from 'vitest'
import {
  SENTRY_TRACES_SAMPLE_RATE,
  scrubSentryBreadcrumb,
  scrubSentryEvent,
} from '#/lib/observability/sentryPrivacy'

describe('frontend Sentry privacy hooks', () => {
  it('disables performance transactions that bypass error-event scrubbing', () => {
    expect(SENTRY_TRACES_SAMPLE_RATE).toBe(0)
  })

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

  it('removes breadcrumb message and data content', () => {
    const breadcrumb = scrubSentryBreadcrumb({
      category: 'fetch',
      message: '/api/v1/tools?token=secret',
      data: {
        url: 'https://api.example.com/path?token=secret',
        request_body: 'private resume',
        response_body: 'private generated result',
      },
    })

    expect(breadcrumb.message).toBeUndefined()
    expect(breadcrumb.data).toBeUndefined()
  })

  it('removes exception messages, local variables, and unsafe contexts', () => {
    const privateValue = 'private resume for sentinel@example.com'
    const event = scrubSentryEvent({
      message: privateValue,
      logentry: { message: privateValue },
      contexts: { react: { componentStack: privateValue } },
      extra: { providerResponse: privateValue },
      exception: {
        values: [{
          type: 'Error',
          value: privateValue,
          stacktrace: { frames: [{ function: 'render', vars: { resume: privateValue } }] },
        }],
      },
    })

    expect(JSON.stringify(event)).not.toContain(privateValue)
    expect(event.exception?.values?.[0]?.type).toBe('Error')
    expect(event.exception?.values?.[0]?.value).toBe('[scrubbed]')
    expect(event.exception?.values?.[0]?.stacktrace?.frames?.[0]?.vars).toBeUndefined()
  })

  it('drops breadcrumbs already attached to an error event', () => {
    const privateValue = 'private resume for sentinel@example.com'
    const event = scrubSentryEvent({
      breadcrumbs: [{ category: 'console', message: privateValue }],
    })

    expect(JSON.stringify(event)).not.toContain(privateValue)
    expect(event.breadcrumbs).toBeUndefined()
  })
})

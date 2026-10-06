import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  __resetRefreshState,
  getCurrentUser,
  importJobUrl,
  login,
  register,
  requestBlob,
  runResumeAnalysis,
} from '#/lib/api/client'
import { ApiError, describeFailure } from '#/lib/api/errors'
import { hasSessionHint, markSessionHint } from '#/lib/auth/sessionHint'

/**
 * Every failure a person can meet, driven through the real client against a stubbed network. The expected
 * sentences are the ticket's (B11): no Zod dump, no "[object Object]", no proxy HTML, no "Failed to fetch".
 */

const fetchMock = vi.fn()
const RESUME = 'Senior engineer with eight years of platform work and a long record of shipped systems.'

function json(body: unknown, status: number, headers: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', ...headers } })
}

async function failureOf(run: () => Promise<unknown>): Promise<ApiError> {
  try {
    await run()
  } catch (error) {
    expect(error).toBeInstanceOf(ApiError)
    return error as ApiError
  }
  throw new Error('expected the call to fail')
}

const calledPaths = () => fetchMock.mock.calls.map(([url]) => new URL(String(url), 'http://x').pathname)

beforeEach(() => {
  vi.stubGlobal('fetch', fetchMock)
  fetchMock.mockReset()
  window.localStorage.clear()
  __resetRefreshState()
})
afterEach(() => {
  vi.unstubAllGlobals()
})

describe('what a form shows when a request fails', () => {
  it('an email the browser accepts but the client refuses reads as one sentence, before any request (auth-account-D01)', async () => {
    const error = await failureOf(() => login({ email: 'a@b', password: 'long-enough-password' }))

    expect(error.message).toBe('Enter a valid email address.')
    expect(error.fields.email).toBe('Enter a valid email address.')
    expect(error.message).not.toContain('[')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it("a server 422 list (someone@company.local) names the field instead of '[object Object]'", async () => {
    fetchMock.mockResolvedValueOnce(
      json(
        {
          detail: [
            {
              type: 'value_error',
              loc: ['body', 'email'],
              msg: 'value is not a valid email address: The part after the @-sign is a special-use or reserved name that cannot be used with email.',
            },
          ],
        },
        422,
      ),
    )

    const error = await failureOf(() =>
      register({ email: 'someone@company.local', password: 'long-enough-password', tos_accepted: true }),
    )

    expect(error.status).toBe(422)
    expect(error.message).toBe('Enter a valid email address.')
    expect(error.fields.email).toBe('Enter a valid email address.')
  })

  it('a link without a scheme or with ftp:// asks for a full https link, before any request (tools-analysis-D04)', async () => {
    for (const url of ['example.com/job', 'ftp://x.com/a']) {
      const error = await failureOf(() => importJobUrl({ url }))
      expect(error.message).toBe('Enter a full link starting with https://')
      expect(error.fields.url).toBe('Enter a full link starting with https://')
    }
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('a 429 from the limiter says how long to wait, from Retry-After (integration-sweep-D05)', async () => {
    fetchMock.mockResolvedValueOnce(json({ error: 'Rate limit exceeded: 10 per 1 minute' }, 429, { 'Retry-After': '40' }))

    const error = await failureOf(() => runResumeAnalysis({ resume_text: RESUME }))

    expect(error.status).toBe(429)
    expect(error.retryAfter).toBe(40)
    expect(error.message).toBe('Too many attempts. Try again in 40 s.')
  })

  it("a 429 without Retry-After reads the limiter's window instead of 'Request failed' (REL-1)", async () => {
    fetchMock.mockResolvedValueOnce(json({ error: 'Rate limit exceeded: 20 per 1 minute' }, 429))

    const error = await failureOf(() => runResumeAnalysis({ resume_text: RESUME }))

    expect(error.retryAfter).toBe(60)
    expect(error.message).toBe('Too many attempts. Try again in 60 s.')
  })

  it('a proxy HTML page, a bare reason phrase and an unknown 500 never reach the screen (admin-legal-errors-D02)', async () => {
    fetchMock
      .mockResolvedValueOnce(new Response('<html><body>Bad gateway</body></html>', { status: 503, headers: { 'Content-Type': 'text/html' } }))
      .mockResolvedValueOnce(new Response('Internal Server Error', { status: 500, headers: { 'Content-Type': 'text/plain' } }))

    const unavailable = await failureOf(() => runResumeAnalysis({ resume_text: RESUME }))
    const broken = await failureOf(() => runResumeAnalysis({ resume_text: RESUME }))

    expect(unavailable.status).toBe(503)
    expect(unavailable.message).toBe('The service is temporarily unavailable. Try again in a moment.')
    expect(broken.status).toBe(500)
    expect(broken.message).toBe('Something went wrong on our side. Try again in a moment.')
  })

  it("keeps a sentence the server wrote for people", async () => {
    fetchMock.mockResolvedValueOnce(json({ detail: 'Incorrect email or password' }, 401))

    const error = await failureOf(() => login({ email: 'ada@example.com', password: 'long-enough-password' }))

    expect(error.message).toBe('Incorrect email or password')
  })

  it("a dropped connection says the server can't be reached, with status 0", async () => {
    fetchMock.mockRejectedValueOnce(new TypeError('Failed to fetch'))

    const error = await failureOf(() => runResumeAnalysis({ resume_text: RESUME }))

    expect(error.status).toBe(0)
    expect(error.message).toBe("Can't reach the server. Check your connection and try again.")
  })

  it("a client timeout says it took too long instead of 'signal timed out' (integration-sweep-D07)", async () => {
    fetchMock.mockRejectedValueOnce(new DOMException('signal timed out', 'TimeoutError'))

    const error = await failureOf(() => runResumeAnalysis({ resume_text: RESUME }))

    expect(error.status).toBe(0)
    expect(error.message).toBe('The server took too long to answer. Try again in a moment.')
  })

  it('a bound the browser input does not check (code points, not UTF-16 units) still reads as a sentence', async () => {
    const error = await failureOf(() =>
      register({ email: 'ada@example.com', password: '\u{1F600}\u{1F600}\u{1F600}\u{1F600}', tos_accepted: true }),
    )

    expect(error.message).toBe('Password must be at least 8 characters.')
    expect(error.fields.password).toBe('Password must be at least 8 characters.')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('a 200 whose body no longer matches the contract is a service problem, not bad input', async () => {
    fetchMock.mockResolvedValueOnce(json({ unexpected: true }, 200))

    const error = await failureOf(() => getCurrentUser())

    expect(error.status).toBe(502)
    expect(error.message).not.toMatch(/[[{]/)
  })
})

describe('the session rules around a 401', () => {
  it('a guest browser never spends a refresh on a 401 (FE-3)', async () => {
    fetchMock.mockResolvedValueOnce(json({ detail: 'Not authenticated' }, 401))

    const error = await failureOf(() => getCurrentUser())

    expect(error.status).toBe(401)
    expect(calledPaths()).toEqual(['/api/v1/auth/me'])
  })

  it('a signed-in browser refreshes once and retries, without signing out', async () => {
    markSessionHint()
    const expired = vi.fn()
    window.addEventListener('cw:session-expired', expired)
    fetchMock
      .mockResolvedValueOnce(json({ detail: 'Not authenticated' }, 401))
      .mockResolvedValueOnce(json({ ok: true }, 200))
      .mockResolvedValueOnce(json({ id: 'u1', email: 'ada@example.com', full_name: null, is_active: true }, 200))

    const user = await getCurrentUser()

    expect(user.id).toBe('u1')
    expect(calledPaths()).toEqual(['/api/v1/auth/me', '/api/v1/auth/refresh', '/api/v1/auth/me'])
    expect(expired).not.toHaveBeenCalled()
    window.removeEventListener('cw:session-expired', expired)
  })

  it('a refused refresh token ends the session: the hint goes and the app hears it once', async () => {
    markSessionHint()
    const expired = vi.fn()
    window.addEventListener('cw:session-expired', expired)
    fetchMock
      .mockResolvedValueOnce(json({ detail: 'Not authenticated' }, 401))
      .mockResolvedValueOnce(json({ detail: 'Invalid refresh token' }, 401))

    await failureOf(() => getCurrentUser())

    expect(hasSessionHint()).toBe(false)
    expect(expired).toHaveBeenCalledTimes(1)
    window.removeEventListener('cw:session-expired', expired)
  })

  it('a request still refused after a good refresh ends the session too', async () => {
    markSessionHint()
    fetchMock
      .mockResolvedValueOnce(json({ detail: 'Not authenticated' }, 401))
      .mockResolvedValueOnce(json({ ok: true }, 200))
      .mockResolvedValueOnce(json({ detail: 'Not authenticated' }, 401))

    await failureOf(() => getCurrentUser())

    expect(hasSessionHint()).toBe(false)
  })

  it('a refresh endpoint that is down or rate-limited is not a sign-out', async () => {
    markSessionHint()
    const expired = vi.fn()
    window.addEventListener('cw:session-expired', expired)
    fetchMock
      .mockResolvedValueOnce(json({ detail: 'Not authenticated' }, 401))
      .mockResolvedValueOnce(json({ error: 'Rate limit exceeded: 20 per 1 minute' }, 429))

    await failureOf(() => getCurrentUser())

    expect(hasSessionHint()).toBe(true)
    expect(expired).not.toHaveBeenCalled()
    window.removeEventListener('cw:session-expired', expired)
  })

  it('a 401 after the hint went elsewhere (signed out in another tab) tells the app, without a refresh', async () => {
    const expired = vi.fn()
    window.addEventListener('cw:session-expired', expired)
    fetchMock.mockResolvedValueOnce(json({ detail: 'Not authenticated' }, 401))

    await failureOf(() => runResumeAnalysis({ resume_text: RESUME }))

    expect(calledPaths()).toEqual(['/api/v1/resume/analyze'])
    expect(expired).toHaveBeenCalledTimes(1)
    window.removeEventListener('cw:session-expired', expired)
  })

  it('more 401s right after a refresh that only failed (503) are still not a sign-out', async () => {
    markSessionHint()
    const expired = vi.fn()
    window.addEventListener('cw:session-expired', expired)
    fetchMock
      .mockResolvedValueOnce(json({ detail: 'Not authenticated' }, 401))
      .mockResolvedValueOnce(json({ detail: 'Service unavailable' }, 503))
      .mockResolvedValueOnce(json({ detail: 'Not authenticated' }, 401))

    await failureOf(() => runResumeAnalysis({ resume_text: RESUME }))
    await failureOf(() => getCurrentUser())

    expect(calledPaths()).toEqual(['/api/v1/resume/analyze', '/api/v1/auth/refresh', '/api/v1/auth/me'])
    expect(hasSessionHint()).toBe(true)
    expect(expired).not.toHaveBeenCalled()
    window.removeEventListener('cw:session-expired', expired)
  })

  it('a refresh that worked renews the hint, so a tab left open keeps refreshing', async () => {
    const sixDaysAgo = Date.now() - 6 * 24 * 60 * 60 * 1000
    window.localStorage.setItem('cw-session-hint', String(sixDaysAgo))
    fetchMock
      .mockResolvedValueOnce(json({ detail: 'Not authenticated' }, 401))
      .mockResolvedValueOnce(json({ ok: true }, 200))
      .mockResolvedValueOnce(json({ detail: 'Not found' }, 404))

    await failureOf(() => runResumeAnalysis({ resume_text: RESUME }))

    expect(Number(window.localStorage.getItem('cw-session-hint'))).toBeGreaterThan(sixDaysAgo)
  })

  it('a wrong password is an answer, not an expired session', async () => {
    markSessionHint()
    fetchMock.mockResolvedValueOnce(json({ detail: 'Incorrect email or password' }, 401))

    await failureOf(() => login({ email: 'ada@example.com', password: 'long-enough-password' }))

    expect(calledPaths()).toEqual(['/api/v1/auth/login'])
  })
})

describe('describeFailure', () => {
  it("never shows a programming error's own words, only the fallback", () => {
    const failure = describeFailure(new TypeError("Cannot read properties of undefined (reading 'id')"), 'Sign-in failed.')

    expect(failure.message).toBe('Sign-in failed.')
  })

  it("a browser's own fetch failure still reads as offline", () => {
    expect(describeFailure(new TypeError('Failed to fetch')).message).toBe(
      "Can't reach the server. Check your connection and try again.",
    )
  })

  it('keeps the sentence an ApiError for a dropped connection already carries', () => {
    const failure = describeFailure(new ApiError('The server took too long to answer. Try again in a moment.', 0))

    expect(failure.kind).toBe('offline')
    expect(failure.message).toBe('The server took too long to answer. Try again in a moment.')
  })
})

describe('file downloads (integration-sweep-D03)', () => {
  it('a PDF after the access token lapsed refreshes, retries and downloads, with the server file name', async () => {
    markSessionHint()
    const expired = vi.fn()
    window.addEventListener('cw:session-expired', expired)
    fetchMock
      .mockResolvedValueOnce(json({ detail: 'Not authenticated' }, 401))
      .mockResolvedValueOnce(json({ ok: true }, 200))
      .mockResolvedValueOnce(
        new Response('%PDF-1.7', {
          status: 200,
          headers: { 'Content-Type': 'application/pdf', 'Content-Disposition': 'attachment; filename="Cover letter - Acme.pdf"' },
        }),
      )

    const { blob, filename } = await requestBlob('/history/run-1/export/pdf')

    expect(blob.size).toBe(8)
    expect(filename).toBe('Cover letter - Acme.pdf')
    expect(calledPaths()).toEqual(['/api/v1/history/run-1/export/pdf', '/api/v1/auth/refresh', '/api/v1/history/run-1/export/pdf'])
    expect(expired).not.toHaveBeenCalled()
    window.removeEventListener('cw:session-expired', expired)
  })

  it('a failed download is an ApiError with a sentence (tools-generative-D14)', async () => {
    fetchMock.mockResolvedValueOnce(new Response('Internal Server Error', { status: 500 }))

    const error = await failureOf(() => requestBlob('/history/run-1/export/pdf'))

    expect(error.message).toBe('Something went wrong on our side. Try again in a moment.')
  })

  it('never takes a path from Content-Disposition as a file name', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response('x', { status: 200, headers: { 'Content-Disposition': 'attachment; filename="../../etc/passwd"' } }),
    )

    const { filename } = await requestBlob('/history/run-1/export/pdf')

    expect(filename).toBeNull()
  })
})

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { getAdminUsers, setAdminStatus } from '#/lib/api/admin'

const mockFetch = vi.fn()

async function failureOf(run: () => Promise<unknown>): Promise<Error> {
  try {
    await run()
  } catch (error) {
    return error as Error
  }
  throw new Error('expected the call to fail')
}

beforeEach(() => {
  vi.stubGlobal('fetch', mockFetch)
  mockFetch.mockReset()
})
afterEach(() => {
  vi.unstubAllGlobals()
})

describe('admin requests read failures the same way as every other request', () => {
  it('turns an array-style 422 into a sentence, never [object Object]', async () => {
    mockFetch.mockResolvedValueOnce(
      new Response(
        JSON.stringify({ detail: [{ type: 'bool_parsing', loc: ['body', 'is_admin'], msg: 'Input should be a valid boolean' }] }),
        { status: 422 },
      ),
    )

    const error = await failureOf(() => setAdminStatus('u1', true))

    // Server wording now ends as a sentence, with a full stop (public-F24).
    expect(error.message).toBe('Is admin: Input should be a valid boolean.')
  })

  it('hides an HTML gateway page', async () => {
    mockFetch.mockResolvedValueOnce(new Response('<html><body>Bad gateway</body></html>', { status: 502 }))

    const error = await failureOf(() => getAdminUsers())

    expect(error.message).toBe('The service is temporarily unavailable. Try again in a moment.')
  })

  it('says the server cannot be reached when the connection drops', async () => {
    mockFetch.mockRejectedValueOnce(new TypeError('Failed to fetch'))

    const error = await failureOf(() => getAdminUsers())

    expect(error.message).toBe("Can't reach the server. Check your connection and try again.")
  })

  it('tells a rate-limited admin how long to wait', async () => {
    mockFetch.mockResolvedValueOnce(new Response('{}', { status: 429, headers: { 'Retry-After': '12' } }))

    const error = await failureOf(() => getAdminUsers())

    expect(error.message).toBe('Too many attempts. Try again in 12 s.')
  })
})

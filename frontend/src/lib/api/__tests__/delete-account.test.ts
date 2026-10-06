import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { deleteAccount } from '#/lib/api/client'
import { hasSessionHint, markSessionHint } from '#/lib/auth/sessionHint'

const fetchMock = vi.fn()

beforeEach(() => {
  vi.stubGlobal('fetch', fetchMock)
  fetchMock.mockReset()
  markSessionHint()
})

afterEach(() => {
  vi.unstubAllGlobals()
  window.localStorage.clear()
})

describe('deleteAccount', () => {
  it('forgets the session hint once the account is gone, so the next load is a quiet guest load', async () => {
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 204 }))
    await deleteAccount('ada@example.com')
    expect(hasSessionHint()).toBe(false)
  })

  it('keeps the hint when the deletion was refused', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ detail: 'Confirmation does not match' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      }),
    )
    await expect(deleteAccount('wrong')).rejects.toBeTruthy()
    expect(hasSessionHint()).toBe(true)
  })
})

import { act, fireEvent, render, screen } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ServiceBanner } from '#/components/app/ServiceBanner'
import { ApiError } from '#/lib/api/errors'

const getHealth = vi.hoisted(() => vi.fn())
const getCurrentUser = vi.hoisted(() => vi.fn())

vi.mock('#/lib/api/client', () => ({ getHealth, getCurrentUser }))

function setOnline(value: boolean) {
  Object.defineProperty(window.navigator, 'onLine', { configurable: true, value })
}

function renderBanner(client = new QueryClient({ defaultOptions: { queries: { retry: false } } })) {
  return {
    client,
    ...render(
      <QueryClientProvider client={client}>
        <ServiceBanner />
      </QueryClientProvider>,
    ),
  }
}

describe('ServiceBanner', () => {
  beforeEach(() => {
    setOnline(true)
    getHealth.mockReset().mockResolvedValue({ status: 'ok' })
    getCurrentUser.mockReset().mockResolvedValue({ id: 'u1' })
  })
  afterEach(() => setOnline(true))

  it('renders nothing while the server answers', () => {
    const { container } = renderBanner()
    expect(container.querySelector('.app-service-banner')).toBeNull()
  })

  it('says it is offline when the browser has no network, and clears when it is back', () => {
    setOnline(false)
    renderBanner()
    expect(screen.getByRole('status').textContent).toContain('You’re offline')

    act(() => {
      setOnline(true)
      window.dispatchEvent(new Event('online'))
    })
    expect(screen.queryByRole('status')).toBeNull()
  })

  it('says the server cannot be reached after a network failure, and Retry asks again', async () => {
    getHealth.mockRejectedValueOnce(new TypeError('Failed to fetch')).mockResolvedValue({ status: 'ok' })
    getCurrentUser.mockRejectedValue(new TypeError('Failed to fetch'))
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    await client.prefetchQuery({ queryKey: ['health'], queryFn: getHealth })
    await client.prefetchQuery({ queryKey: ['current-user'], queryFn: getCurrentUser })
    renderBanner(client)

    expect((await screen.findByRole('status')).textContent).toContain('Can’t reach the server')
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }))
    await vi.waitFor(() => expect(getHealth).toHaveBeenCalledTimes(2))
  })

  it('tells a server error apart from a server it cannot reach', async () => {
    getCurrentUser.mockRejectedValue(new ApiError('Something went wrong on our side. Try again in a moment.', 503))
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    await client.prefetchQuery({ queryKey: ['current-user'], queryFn: getCurrentUser })
    renderBanner(client)

    const banner = await screen.findByRole('status')
    expect(banner.textContent).toContain('The server ran into a problem')
    expect(banner.textContent).not.toContain('Can’t reach the server')
    expect(banner.getAttribute('data-kind')).toBe('server-error')
  })

  it('names a refused connection as unreachable', async () => {
    getCurrentUser.mockRejectedValue(new ApiError("Can't reach the server. Check your connection and try again.", 0))
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    await client.prefetchQuery({ queryKey: ['current-user'], queryFn: getCurrentUser })
    renderBanner(client)

    const banner = await screen.findByRole('status')
    expect(banner.textContent).toContain('Can’t reach the server')
    expect(banner.getAttribute('data-kind')).toBe('unreachable')
  })

  it('treats a 401 as an answer, not an outage', async () => {
    getHealth.mockResolvedValue({ status: 'ok' })
    getCurrentUser.mockRejectedValue(new ApiError('Not authenticated', 401))
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    await client.prefetchQuery({ queryKey: ['health'], queryFn: getHealth })
    await client.prefetchQuery({ queryKey: ['current-user'], queryFn: getCurrentUser })
    const { container } = renderBanner(client)

    expect(container.querySelector('.app-service-banner')).toBeNull()
  })
})

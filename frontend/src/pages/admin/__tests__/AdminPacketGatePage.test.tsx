import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { AdminPacketGatePage } from '#/pages/admin/admin-packet-gate-page'

const getAdminPacketGateMock = vi.hoisted(() => vi.fn())

vi.mock('#/lib/api/admin', () => ({
  getAdminPacketGate: getAdminPacketGateMock,
}))

function renderPage(data: Record<string, unknown>) {
  getAdminPacketGateMock.mockResolvedValue({
    window_start: '2026-06-30T00:00:00Z',
    window_end: '2026-07-14T00:00:00Z',
    gate_running: 0,
    gate_passed: 0,
    gate_blocked: 0,
    ...data,
  })
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={client}>
      <AdminPacketGatePage />
    </QueryClientProvider>,
  )
}

describe('AdminPacketGatePage', () => {
  it('shows the gate outcome counts', async () => {
    renderPage({ gate_running: 3, gate_passed: 2, gate_blocked: 1 })

    expect(await screen.findByText('Packet Gate')).toBeTruthy()
    expect(await screen.findByText('running')).toBeTruthy()
    expect(screen.getByText('blocked')).toBeTruthy()
  })

  it('surfaces a load error explicitly', async () => {
    getAdminPacketGateMock.mockRejectedValue(new Error('boom'))
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    render(
      <QueryClientProvider client={client}>
        <AdminPacketGatePage />
      </QueryClientProvider>,
    )
    expect(await screen.findByText('Failed to load packet gate state.')).toBeTruthy()
  })
})

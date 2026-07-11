import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { AdminProfileAdoption } from '#/lib/api/admin'
import { AdminProfileAdoptionPage } from '#/pages/admin/admin-profile-adoption-page'

// R11 #150: the profile-adoption page renders read-only bounded counts derived
// from allowlisted profile events (D-067) — lifecycle totals, created items by
// kind and provenance class, and confirm/reject trust decisions. This test
// drives it with a FAKE adoption payload and asserts the low-cardinality counts
// surface without any evidence content.

const getAdminProfileAdoptionMock = vi.hoisted(() => vi.fn())

vi.mock('#/lib/api/admin', () => ({
  getAdminProfileAdoption: getAdminProfileAdoptionMock,
}))

function renderPage(payload: AdminProfileAdoption) {
  getAdminProfileAdoptionMock.mockResolvedValue(payload)
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={client}>
      <AdminProfileAdoptionPage />
    </QueryClientProvider>,
  )
}

describe('AdminProfileAdoptionPage', () => {
  it('renders adoption and trust counts', async () => {
    renderPage({
      window_start: '2026-06-27T00:00:00+00:00',
      window_end: '2026-07-11T23:59:59+00:00',
      total_created: 12,
      total_deleted: 3,
      created_by_kind: [
        { kind: 'skill', count: 7 },
        { kind: 'experience', count: 5 },
      ],
      created_by_provenance: [
        { provenance: 'imported', count: 8 },
        { provenance: 'user-entered', count: 4 },
      ],
      confirmation_transitions: [
        { transition: 'confirmed', count: 6 },
        { transition: 'rejected', count: 2 },
      ],
    })

    // Await a data-dependent element so the query has resolved.
    expect(await screen.findByText('skill')).toBeTruthy()
    // Lifecycle totals.
    expect(screen.getByText('12')).toBeTruthy()
    expect(screen.getByText('3')).toBeTruthy()
    // Kind + provenance breakdowns and trust decisions.
    expect(screen.getByText('experience')).toBeTruthy()
    expect(screen.getByText('imported')).toBeTruthy()
    expect(screen.getByText('confirmed')).toBeTruthy()
    expect(screen.getByText('rejected')).toBeTruthy()
  })

  it('shows empty states when nothing happened in range', async () => {
    renderPage({
      window_start: '2026-06-27T00:00:00+00:00',
      window_end: '2026-07-11T23:59:59+00:00',
      total_created: 0,
      total_deleted: 0,
      created_by_kind: [],
      created_by_provenance: [],
      confirmation_transitions: [],
    })

    expect(await screen.findByText('No confirm/reject decisions in range.')).toBeTruthy()
    // The "no items created" empty state appears in both the provenance panel
    // and the by-kind table.
    expect(screen.getAllByText('No items created in range.').length).toBeGreaterThan(0)
  })
})

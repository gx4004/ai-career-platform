import type { ReactNode } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { DiscoveryPage } from '#/pages/discovery-page'

const listRecommendations = vi.hoisted(() => vi.fn())

vi.mock('#/lib/api/client', () => ({
  listDiscoveryRecommendations: listRecommendations,
}))

vi.mock('@tanstack/react-router', () => ({
  Link: ({ children, to }: { children: ReactNode; to: string }) => (
    <a href={to}>{children}</a>
  ),
}))

function renderPage(payload: unknown) {
  listRecommendations.mockResolvedValue(payload)
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={client}>
      <DiscoveryPage />
    </QueryClientProvider>,
  )
}

describe('DiscoveryPage', () => {
  it('renders rank rationale, source, and retrieval date for each live recommendation', async () => {
    renderPage({
      confirmed_item_count: 2,
      preference_item_count: 1,
      items: [
        {
          listing_id: 'listing-1',
          title: 'Platform Engineer',
          company: 'Acme Systems',
          description: 'Build Kubernetes services.',
          score: 82,
          rationale: [
            {
              kind: 'confirmed_evidence',
              label: 'Confirmed evidence overlaps this listing',
              matched_keywords: ['Kubernetes'],
              evidence_item_ids: ['evidence-1'],
              score: 80,
            },
            {
              kind: 'preference',
              label: 'Confirmed preferences align with this listing',
              matched_keywords: ['Platform'],
              evidence_item_ids: ['preference-1'],
              score: 90,
            },
          ],
          attributions: [
            {
              source_name: 'Licensed Feed',
              source_family: 'licensed',
              source_url: 'https://feed.example/jobs/1',
              retrieved_at: '2026-07-13T00:00:00Z',
            },
          ],
        },
      ],
    })

    expect(await screen.findByRole('heading', { name: 'Platform Engineer' })).toBeTruthy()
    expect(screen.getByText('Kubernetes')).toBeTruthy()
    expect(screen.getByText('Platform')).toBeTruthy()
    expect(screen.getByLabelText('82 out of 100 match')).toBeTruthy()
    const source = screen.getByRole('link', { name: /licensed feed/i })
    expect(source.getAttribute('href')).toBe('https://feed.example/jobs/1')
    expect(source.getAttribute('target')).toBe('_blank')
    expect(screen.getByText(/Retrieved/)).toBeTruthy()
  })

  it('asks users without confirmed items to review their evidence profile', async () => {
    renderPage({ confirmed_item_count: 0, preference_item_count: 0, items: [] })

    expect(await screen.findByText('Confirm profile evidence to rank opportunities.')).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Review evidence profile' }).getAttribute('href')).toBe('/profile')
  })
})

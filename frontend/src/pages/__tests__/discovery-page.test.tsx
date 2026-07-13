import type { ReactNode } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { DiscoveryPage } from '#/pages/discovery-page'

const listRecommendations = vi.hoisted(() => vi.fn())
const getPersonalization = vi.hoisted(() => vi.fn())
const hideSource = vi.hoisted(() => vi.fn())
const unhideSource = vi.hoisted(() => vi.fn())
const dismissRecommendation = vi.hoisted(() => vi.fn())
const undismissRecommendation = vi.hoisted(() => vi.fn())
const reportRecommendation = vi.hoisted(() => vi.fn())

vi.mock('#/lib/api/client', () => ({
  listDiscoveryRecommendations: listRecommendations,
  getDiscoveryPersonalization: getPersonalization,
  hideDiscoverySource: hideSource,
  unhideDiscoverySource: unhideSource,
  dismissDiscoveryRecommendation: dismissRecommendation,
  undismissDiscoveryRecommendation: undismissRecommendation,
  reportDiscoveryRecommendation: reportRecommendation,
}))

vi.mock('@tanstack/react-router', () => ({
  Link: ({ children, to }: { children: ReactNode; to: string }) => (
    <a href={to}>{children}</a>
  ),
}))

const RECOMMENDATION = {
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
      source_id: 'source-1',
      source_name: 'Licensed Feed',
      source_family: 'licensed',
      source_url: 'https://feed.example/jobs/1',
      retrieved_at: '2026-07-13T00:00:00Z',
    },
  ],
}

function renderPage(payload: unknown, personalization: unknown = { hidden_sources: [], dismissals: [] }) {
  listRecommendations.mockResolvedValue(payload)
  getPersonalization.mockResolvedValue(personalization)
  hideSource.mockResolvedValue({})
  unhideSource.mockResolvedValue(undefined)
  dismissRecommendation.mockResolvedValue({})
  reportRecommendation.mockResolvedValue({})
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={client}>
      <DiscoveryPage />
    </QueryClientProvider>,
  )
}

describe('DiscoveryPage', () => {
  it('renders rank rationale, source, and retrieval date for each live recommendation', async () => {
    renderPage({ confirmed_item_count: 2, preference_item_count: 1, items: [RECOMMENDATION] })

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

  it('offers a correct-preferences link that points at the evidence profile', async () => {
    renderPage({ confirmed_item_count: 1, preference_item_count: 1, items: [RECOMMENDATION] })
    await screen.findByRole('heading', { name: 'Platform Engineer' })

    const link = screen.getByRole('link', { name: 'Correct your preferences' })
    expect(link.getAttribute('href')).toBe('/profile')
  })

  it('dismisses a recommendation through the owner-scoped control', async () => {
    renderPage({ confirmed_item_count: 1, preference_item_count: 1, items: [RECOMMENDATION] })
    await screen.findByRole('heading', { name: 'Platform Engineer' })

    fireEvent.click(screen.getByRole('button', { name: /Dismiss/ }))
    await waitFor(() => expect(dismissRecommendation).toHaveBeenCalledWith('listing-1'))
  })

  it('hides a source from a card', async () => {
    renderPage({ confirmed_item_count: 1, preference_item_count: 1, items: [RECOMMENDATION] })
    await screen.findByRole('heading', { name: 'Platform Engineer' })

    fireEvent.click(screen.getByRole('button', { name: 'Hide Licensed Feed' }))
    await waitFor(() => expect(hideSource).toHaveBeenCalledWith('source-1'))
  })

  it('reports a recommendation with a required reason', async () => {
    renderPage({ confirmed_item_count: 1, preference_item_count: 1, items: [RECOMMENDATION] })
    await screen.findByRole('heading', { name: 'Platform Engineer' })

    // The report form is hidden until the control is opened.
    expect(screen.queryByLabelText('Report this recommendation')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: /Report a problem/ }))

    const form = screen.getByLabelText('Report this recommendation')
    expect(form).toBeTruthy()
    const textarea = screen.getByPlaceholderText('Tell us why this recommendation is wrong.')
    fireEvent.change(textarea, { target: { value: 'Wrong location entirely.' } })
    fireEvent.submit(form)

    await waitFor(() =>
      expect(reportRecommendation).toHaveBeenCalledWith({
        listingId: 'listing-1',
        reasonCategory: 'not_relevant',
        reason: 'Wrong location entirely.',
      }),
    )
  })

  it('lists hidden sources with an unhide control', async () => {
    renderPage(
      { confirmed_item_count: 1, preference_item_count: 1, items: [RECOMMENDATION] },
      {
        hidden_sources: [
          {
            source_id: 'source-1',
            source_key: 'feed',
            display_name: 'Licensed Feed',
            source_family: 'licensed',
            created_at: '2026-07-13T00:00:00Z',
          },
        ],
        dismissals: [],
      },
    )
    await screen.findByRole('heading', { name: 'Platform Engineer' })

    const unhide = await screen.findByRole('button', { name: /Unhide/ })
    fireEvent.click(unhide)
    await waitFor(() => expect(unhideSource).toHaveBeenCalledWith('source-1'))
  })
})

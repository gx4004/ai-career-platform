import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ClaimPromotionSection } from '#/components/profile/ClaimPromotionSection'

const createItemMock = vi.hoisted(() => vi.fn())
const listItemsMock = vi.hoisted(() => vi.fn())
vi.mock('#/lib/api/client', () => ({
  createEvidenceItem: createItemMock,
  listEvidenceItems: listItemsMock,
}))

const INTERVIEW_PAYLOAD = {
  questions: [
    { question: 'Tell me about a hard bug.', answer: 'I traced a race condition…' },
    { question: 'Why this role?', answer: 'The mission aligns…' },
  ],
}

function wrap(children: ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>
}

const item = (content: Record<string, unknown>, kind = 'interview-evidence') => ({
  id: `e-${JSON.stringify(content).length}`,
  kind,
  content,
  provenance: 'inferred',
  confirmation_state: 'unconfirmed',
  created_at: '2026-10-06T10:00:00Z',
  updated_at: '2026-10-06T10:00:00Z',
})

describe('ClaimPromotionSection', () => {
  beforeEach(() => {
    createItemMock.mockReset()
    listItemsMock.mockReset()
    listItemsMock.mockResolvedValue({ items: [] })
  })

  it('renders a promote control per claim for an authenticated user', () => {
    render(wrap(<ClaimPromotionSection toolId="interview" payload={INTERVIEW_PAYLOAD} authenticated />))
    expect(screen.getByText('Save to your profile')).toBeTruthy()
    expect(screen.getAllByRole('button', { name: /Add ".*" to your profile/ })).toHaveLength(2)
  })

  it('renders nothing for a guest (promotion is authenticated-only)', () => {
    const { container } = render(
      wrap(<ClaimPromotionSection toolId="interview" payload={INTERVIEW_PAYLOAD} authenticated={false} />),
    )
    expect(container.firstChild).toBeNull()
    expect(listItemsMock).not.toHaveBeenCalled()
  })

  it('renders nothing for tools without reusable claims', () => {
    const { container } = render(wrap(<ClaimPromotionSection toolId="resume" payload={{ overall_score: 80 }} authenticated />))
    expect(container.firstChild).toBeNull()
  })

  // Sign-off tool-results-F55: "Added to profile" lived in component state only, so a reopened result offered every
  // claim again and a second click made a duplicate suggestion. The profile itself now says what is already there.
  it('shows a claim already in the profile as added, whitespace and case aside, and offers only the others', async () => {
    listItemsMock.mockResolvedValue({
      items: [
        item({ question: 'tell me about a  hard bug.', answer: 'I traced a race condition…', focus_area: 'Debugging' }),
        // Same words, another kind: not the same claim.
        item({ question: 'Why this role?', answer: 'The mission aligns…' }, 'achievement'),
      ],
    })
    render(wrap(<ClaimPromotionSection toolId="interview" payload={INTERVIEW_PAYLOAD} authenticated />))
    expect(await screen.findByText('Added to profile')).toBeTruthy()
    const buttons = screen.getAllByRole('button', { name: /Add ".*" to your profile/ })
    expect(buttons).toHaveLength(1)
    expect(buttons[0].getAttribute('aria-label')).toContain('Why this role?')
  })

  it('reads the profile again after an add, so the claim stays added', async () => {
    createItemMock.mockResolvedValue({ id: 'e1' })
    render(wrap(<ClaimPromotionSection toolId="interview" payload={INTERVIEW_PAYLOAD} authenticated />))
    await waitFor(() => expect(listItemsMock).toHaveBeenCalledTimes(1))
    fireEvent.click(screen.getAllByRole('button', { name: /Add ".*" to your profile/ })[0])
    await waitFor(() => expect(listItemsMock).toHaveBeenCalledTimes(2))
    expect(screen.getByText('Added to profile')).toBeTruthy()
  })
})

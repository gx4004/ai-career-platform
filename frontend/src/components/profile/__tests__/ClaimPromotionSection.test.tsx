import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ClaimPromotionSection } from '#/components/profile/ClaimPromotionSection'

vi.mock('#/lib/api/client', () => ({
  createEvidenceItem: vi.fn(),
}))

const INTERVIEW_PAYLOAD = {
  questions: [
    { question: 'Tell me about a hard bug.', answer: 'I traced a race condition…' },
    { question: 'Why this role?', answer: 'The mission aligns…' },
  ],
}

describe('ClaimPromotionSection', () => {
  beforeEach(() => vi.stubEnv('VITE_R11_EVIDENCE_PROFILE_ENABLED', 'true'))

  it('renders a promote control per claim for an authenticated user', () => {
    render(<ClaimPromotionSection toolId="interview" payload={INTERVIEW_PAYLOAD} authenticated />)
    expect(screen.getByText('Save to your Evidence Profile')).toBeTruthy()
    expect(screen.getAllByRole('button', { name: /Add ".*" to your Evidence Profile/ })).toHaveLength(2)
  })

  it('renders nothing for a guest (promotion is authenticated-only)', () => {
    const { container } = render(
      <ClaimPromotionSection toolId="interview" payload={INTERVIEW_PAYLOAD} authenticated={false} />,
    )
    expect(container.firstChild).toBeNull()
  })

  it('renders nothing for tools without reusable claims', () => {
    const { container } = render(
      <ClaimPromotionSection toolId="resume" payload={{ overall_score: 80 }} authenticated />,
    )
    expect(container.firstChild).toBeNull()
  })
})

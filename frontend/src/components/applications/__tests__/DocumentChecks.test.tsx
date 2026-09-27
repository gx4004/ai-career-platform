import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { DocumentChecks } from '#/components/applications/DocumentChecks'
import { ApiError } from '#/lib/api/errors'

const api = vi.hoisted(() => ({
  reviewApplication: vi.fn(),
  classifyApplicationGaps: vi.fn(),
  getApplicationGapResponse: vi.fn(),
  confirmEvidenceItem: vi.fn(),
}))
const createDevelopmentItem = vi.hoisted(() => vi.fn())

vi.mock('#/lib/api/client', () => api)
vi.mock('#/lib/api/development', () => ({ createDevelopmentItem }))
// The reviewer links first-party next steps with the router's Link; the anchor
// keeps the destination assertable without standing a router up.
vi.mock('@tanstack/react-router', () => ({
  Link: ({ to, children }: { to: string; children: React.ReactNode }) => (
    <a href={to}>{children}</a>
  ),
}))

const review = {
  findings: [
    {
      id: 'finding-1',
      category: 'unsupported_claim',
      severity: 'high',
      message: 'The migration result is not traceable to confirmed evidence.',
      locations: ['Cover letter:chars 20-45'],
      trace: ['claim:Reduced migration time by 30%', 'result:unsupported'],
    },
  ],
}

const classification = {
  id: 'gap-1',
  workspace_id: 'campaign-1',
  finding_id: 'finding-1',
  source_category: 'unsupported_claim',
  gap_kind: 'uncaptured_evidence',
  message: 'The migration result is not traceable to confirmed evidence.',
  locations: ['Cover letter:chars 20-45'],
  cited_trace: [
    'claim:Reduced migration time by 30%',
    'result:unsupported',
    'classified:uncaptured_evidence:claim_present_unconfirmed',
  ],
  created_at: '2026-08-13T10:00:00Z',
}

const response = {
  gap_classification_id: 'gap-1',
  gap_kind: 'uncaptured_evidence',
  response_kind: 'capture_evidence',
  action_path: 'evidence_profile_create',
  headline: 'Capture this as evidence',
  detail: 'You already have this. Record it through the normal review flow.',
  capture_proposal: {
    kind: 'achievement',
    content: { statement: 'Reduced migration time by 30%' },
    provenance: 'inferred',
  },
  sources: [],
  commercial_relationship: 'none',
}

// R17 #197: a substance gap the user cannot yet close must still name where to
// go next — here the Portfolio Planner the user already has.
const produceEvidenceResponse = {
  gap_classification_id: 'gap-1',
  gap_kind: 'evidence_not_yet_produced',
  response_kind: 'produce_evidence',
  action_path: 'portfolio_planner',
  headline: 'Plan a portfolio project',
  detail: 'Build something that demonstrates this requirement.',
  capture_proposal: null,
  sources: [{ label: 'Portfolio Planner: Kubernetes', url: null, route: '/portfolio' }],
  commercial_relationship: 'none',
}

const developmentItem = {
  id: 'development-1',
  gap_classification_id: 'gap-1',
  gap_kind: 'uncaptured_evidence',
  response_kind: 'capture_evidence',
  state: 'planned',
  target_date: null,
  notes: null,
  evidence_item_id: null,
  created_at: '2026-08-13T10:05:00Z',
  updated_at: '2026-08-13T10:05:00Z',
}

function renderReviewer() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  })
  return render(
    <QueryClientProvider client={queryClient}>
      <DocumentChecks applicationId="campaign-1" />
    </QueryClientProvider>,
  )
}

describe('DocumentChecks next-step path', () => {
  beforeEach(() => {
    api.reviewApplication.mockReset().mockResolvedValue(review)
    api.classifyApplicationGaps.mockReset().mockResolvedValue({
      schema_version: 'gap-classification/v1',
      classifications: [classification],
    })
    api.getApplicationGapResponse.mockReset().mockResolvedValue(response)
    api.confirmEvidenceItem.mockReset()
    createDevelopmentItem.mockReset().mockResolvedValue(developmentItem)
  })

  it('surfaces classification and development actions once the checks find something', async () => {
    renderReviewer()

    fireEvent.click(screen.getByRole('button', { name: 'Run the checks' }))
    expect(await screen.findByText(review.findings[0].message)).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Suggest next steps' })).toBeTruthy()
  })

  it('requires explicit review, classification, response inspection, and plan creation', async () => {
    renderReviewer()

    expect(api.classifyApplicationGaps).not.toHaveBeenCalled()
    expect(createDevelopmentItem).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole('button', { name: 'Run the checks' }))
    const finding = await screen.findByRole('article')
    expect(within(finding).getByText(review.findings[0].message)).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'Suggest next steps' }))
    await waitFor(() =>
      expect(api.classifyApplicationGaps).toHaveBeenCalledWith('campaign-1'),
    )
    expect(await within(finding).findByText('Uncaptured evidence')).toBeTruthy()

    fireEvent.click(within(finding).getByText('Why?'))
    expect(
      within(finding).getByText(
        'classified:uncaptured_evidence:claim_present_unconfirmed',
      ),
    ).toBeTruthy()
    expect(api.getApplicationGapResponse).not.toHaveBeenCalled()

    fireEvent.click(within(finding).getByRole('button', { name: 'See what to do' }))
    await waitFor(() =>
      expect(api.getApplicationGapResponse).toHaveBeenCalledWith('campaign-1', 'gap-1'),
    )
    expect(await within(finding).findByText('Capture this as evidence')).toBeTruthy()
    expect(within(finding).getByText('Reduced migration time by 30%')).toBeTruthy()
    expect(within(finding).getByText(/Source: Inferred/)).toBeTruthy()
    expect(within(finding).getByText(/Not saved yet/)).toBeTruthy()
    expect(within(finding).getByText('None disclosed')).toBeTruthy()
    expect(createDevelopmentItem).not.toHaveBeenCalled()
    expect(api.confirmEvidenceItem).not.toHaveBeenCalled()

    fireEvent.click(within(finding).getByRole('button', { name: 'Add to my development plan' }))
    await waitFor(() =>
      expect(createDevelopmentItem).toHaveBeenCalledWith({
        gap_classification_id: 'gap-1',
      }),
    )
    expect(await within(finding).findByRole('status')).toHaveProperty(
      'textContent',
      'Added to your development plan.',
    )
    expect(api.confirmEvidenceItem).not.toHaveBeenCalled()
    expect(
      within(finding).getByRole('button', { name: 'Added to your plan' }),
    ).toHaveProperty('disabled', true)
  })

  it('links the named first-party next step for a gap it cannot close', async () => {
    api.getApplicationGapResponse.mockResolvedValue(produceEvidenceResponse)
    renderReviewer()

    fireEvent.click(screen.getByRole('button', { name: 'Run the checks' }))
    const finding = await screen.findByRole('article')
    fireEvent.click(screen.getByRole('button', { name: 'Suggest next steps' }))
    await waitFor(() =>
      expect(api.classifyApplicationGaps).toHaveBeenCalledWith('campaign-1'),
    )
    fireEvent.click(within(finding).getByRole('button', { name: 'See what to do' }))

    const step = await within(finding).findByRole('link', {
      name: 'Portfolio Planner: Kubernetes',
    })
    // In-app, so the step is reachable without leaving the campaign.
    expect(step.getAttribute('href')).toBe('/portfolio')
    expect(step.getAttribute('target')).toBeNull()
    expect(within(finding).getByText('None disclosed')).toBeTruthy()
  })

  it('renders the disclosed relationship from the payload, never a fixed claim', async () => {
    // D-111: if the backend ever widens `commercial_relationship`, the UI must
    // not keep asserting "None disclosed". The cast stands in for that widening.
    api.getApplicationGapResponse.mockResolvedValue({
      ...response,
      commercial_relationship: 'affiliate' as never,
    })
    renderReviewer()

    fireEvent.click(screen.getByRole('button', { name: 'Run the checks' }))
    const finding = await screen.findByRole('article')
    fireEvent.click(screen.getByRole('button', { name: 'Suggest next steps' }))
    await waitFor(() =>
      expect(api.classifyApplicationGaps).toHaveBeenCalledWith('campaign-1'),
    )
    fireEvent.click(within(finding).getByRole('button', { name: 'See what to do' }))

    expect(await within(finding).findByText('affiliate')).toBeTruthy()
    expect(within(finding).queryByText('None disclosed')).toBeNull()
  })

})

describe('DocumentChecks', () => {
  beforeEach(() => {
    api.reviewApplication.mockReset().mockResolvedValue(review)
  })

  function item(title: string) {
    return screen.getByText(title).closest('li') as HTMLElement
  }

  it('waits for the owner to run the checks', () => {
    renderReviewer()
    expect(within(item('You cover what the job asks for')).getByLabelText('Not checked yet')).toBeTruthy()
    expect(api.reviewApplication).not.toHaveBeenCalled()
  })

  it('files each finding under its check in plain words, and hides it on request', async () => {
    renderReviewer()
    fireEvent.click(screen.getByRole('button', { name: 'Run the checks' }))

    const finding = await screen.findByRole('article')
    const claims = item('Everything you claim is backed up')
    expect(within(claims).getByLabelText('Needs a look')).toBeTruthy()
    expect(within(claims).getByText(review.findings[0].message)).toBeTruthy()
    expect(within(finding).getByText('Where: Cover letter')).toBeTruthy()
    expect(within(item('Your documents agree')).getByLabelText('Done')).toBeTruthy()
    expect(screen.getByText('1 thing to look at')).toBeTruthy()

    fireEvent.click(within(finding).getByRole('button', { name: 'Hide' }))
    expect(screen.queryByRole('article')).toBeNull()
    expect(screen.getByText('All clear. Nice work.')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Check again' })).toBeTruthy()
  })

  it('says so plainly when the checks cannot run', async () => {
    api.reviewApplication.mockRejectedValueOnce(new ApiError('Add the job posting before checking', 409))
    renderReviewer()
    fireEvent.click(screen.getByRole('button', { name: 'Run the checks' }))
    expect((await screen.findByRole('alert')).textContent).toBe('Add the job posting before checking')
  })
})

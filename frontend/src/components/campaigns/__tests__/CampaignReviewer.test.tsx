import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { CampaignReviewer } from '#/components/campaigns/CampaignReviewer'

const api = vi.hoisted(() => ({
  reviewCampaign: vi.fn(),
  classifyCampaignGaps: vi.fn(),
  getCampaignGapResponse: vi.fn(),
  setEvidenceItemConfirmation: vi.fn(),
}))
const createDevelopmentItem = vi.hoisted(() => vi.fn())

vi.mock('#/lib/api/client', () => api)
vi.mock('#/lib/api/development', () => ({ createDevelopmentItem }))

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

const developmentItem = {
  id: 'development-1',
  gap_classification_id: 'gap-1',
  gap_kind: 'uncaptured_evidence',
  response_kind: 'capture_evidence',
  state: 'planned',
  target_date: null,
  notes: null,
  source_finding_id: 'finding-1',
  timeline: [{ event: 'created', state: 'planned' }],
  evidence_proposal: null,
  created_at: '2026-08-13T10:05:00Z',
  updated_at: '2026-08-13T10:05:00Z',
}

function setOutcomeFlags(r17Enabled: boolean) {
  for (const flag of [
    'VITE_R11_EVIDENCE_PROFILE_ENABLED',
    'VITE_R12_CV_STUDIO_ENABLED',
    'VITE_R13_CAMPAIGNS_ENABLED',
    'VITE_R14_DISCOVERY_ENABLED',
    'VITE_R15_QUEUE_ENABLED',
    'VITE_R16_SUBMISSION_FOUNDATION_ENABLED',
  ]) {
    vi.stubEnv(flag, 'true')
  }
  vi.stubEnv('VITE_R17_DEVELOPMENT_LOOP_ENABLED', String(r17Enabled))
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
      <CampaignReviewer campaignId="campaign-1" />
    </QueryClientProvider>,
  )
}

describe('CampaignReviewer development acceptance path', () => {
  beforeEach(() => {
    api.reviewCampaign.mockReset().mockResolvedValue(review)
    api.classifyCampaignGaps.mockReset().mockResolvedValue({
      schema_version: 'gap-classification/v1',
      classifications: [classification],
    })
    api.getCampaignGapResponse.mockReset().mockResolvedValue(response)
    api.setEvidenceItemConfirmation.mockReset()
    createDevelopmentItem.mockReset().mockResolvedValue(developmentItem)
  })

  afterEach(() => vi.unstubAllEnvs())

  it('keeps classification and development actions dark without the complete R17 flag chain', async () => {
    setOutcomeFlags(true)
    vi.stubEnv('VITE_R16_SUBMISSION_FOUNDATION_ENABLED', 'false')
    renderReviewer()

    fireEvent.click(screen.getByRole('button', { name: 'Run application review' }))
    expect(await screen.findByText(review.findings[0].message)).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Classify review findings' })).toBeNull()
    expect(api.classifyCampaignGaps).not.toHaveBeenCalled()
  })

  it('requires explicit review, classification, response inspection, and plan creation', async () => {
    setOutcomeFlags(true)
    renderReviewer()

    expect(api.classifyCampaignGaps).not.toHaveBeenCalled()
    expect(createDevelopmentItem).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole('button', { name: 'Run application review' }))
    const finding = await screen.findByRole('article')
    expect(within(finding).getByText(review.findings[0].message)).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'Classify review findings' }))
    await waitFor(() =>
      expect(api.classifyCampaignGaps).toHaveBeenCalledWith('campaign-1'),
    )
    expect(await within(finding).findByText('Uncaptured evidence')).toBeTruthy()

    fireEvent.click(within(finding).getByText('Why this classification'))
    expect(
      within(finding).getByText(
        'classified:uncaptured_evidence:claim_present_unconfirmed',
      ),
    ).toBeTruthy()
    expect(api.getCampaignGapResponse).not.toHaveBeenCalled()

    fireEvent.click(within(finding).getByRole('button', { name: 'Inspect honest response' }))
    await waitFor(() =>
      expect(api.getCampaignGapResponse).toHaveBeenCalledWith('campaign-1', 'gap-1'),
    )
    expect(await within(finding).findByText('Capture this as evidence')).toBeTruthy()
    expect(within(finding).getByText('Reduced migration time by 30%')).toBeTruthy()
    expect(within(finding).getByText('Inferred')).toBeTruthy()
    expect(within(finding).getByText('Not saved or confirmed')).toBeTruthy()
    expect(within(finding).getByText('None disclosed')).toBeTruthy()
    expect(createDevelopmentItem).not.toHaveBeenCalled()
    expect(api.setEvidenceItemConfirmation).not.toHaveBeenCalled()

    fireEvent.click(within(finding).getByRole('button', { name: 'Add to development plan' }))
    await waitFor(() =>
      expect(createDevelopmentItem).toHaveBeenCalledWith({
        gap_classification_id: 'gap-1',
      }),
    )
    expect(await within(finding).findByRole('status')).toHaveProperty(
      'textContent',
      'Added as planned. No evidence was created or confirmed.',
    )
    expect(api.setEvidenceItemConfirmation).not.toHaveBeenCalled()
    expect(
      within(finding).getByRole('button', { name: 'Added to development plan' }),
    ).toHaveProperty('disabled', true)
  })
})

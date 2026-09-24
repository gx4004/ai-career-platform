import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { CampaignChecklist } from '#/components/campaigns/CampaignChecklist'
import type { CampaignDetail } from '#/lib/api/schemas'

const api = vi.hoisted(() => ({
  reviewCampaign: vi.fn(),
  classifyCampaignGaps: vi.fn(),
  getCampaignGapResponse: vi.fn(),
  setEvidenceItemConfirmation: vi.fn(),
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

const baseCampaign = {
  id: 'campaign-1', label: null, is_pinned: false, company: 'Northstar', role: 'Platform Engineer', status: 'preparing',
  deadline: null, listing: null, linked_run_ids: [], last_active_tool: null, last_active_result_id: null,
  updated_at: '2026-08-13T10:00:00Z', next_task: null, last_activity_at: null,
  selected_materials: { cv_variant: null, cover_letter: null, interview: null },
  available_materials: { cv_variants: [], cover_letters: [], interviews: [] },
  events: [], tasks: [], notes: [], contacts: [], submission_snapshots: [],
} as CampaignDetail

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
  ]) {
    vi.stubEnv(flag, 'true')
  }
  vi.stubEnv('VITE_R17_DEVELOPMENT_LOOP_ENABLED', String(r17Enabled))
}

function renderReviewer(campaign: CampaignDetail = baseCampaign) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  })
  return render(
    <QueryClientProvider client={queryClient}>
      <CampaignChecklist campaign={campaign} />
    </QueryClientProvider>,
  )
}

describe('CampaignChecklist next-step path', () => {
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

  it('keeps classification and development actions dark when only R17 itself is off (#321: flags are independent)', async () => {
    setOutcomeFlags(false)
    renderReviewer()

    fireEvent.click(screen.getByRole('button', { name: 'Run the checks' }))
    expect(await screen.findByText(review.findings[0].message)).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Suggest next steps' })).toBeNull()
    expect(api.classifyCampaignGaps).not.toHaveBeenCalled()
  })

  it('surfaces classification and development actions from R17 alone, regardless of every other outcome flag', async () => {
    setOutcomeFlags(true)
    vi.stubEnv('VITE_R13_CAMPAIGNS_ENABLED', 'false')
    renderReviewer()

    fireEvent.click(screen.getByRole('button', { name: 'Run the checks' }))
    expect(await screen.findByText(review.findings[0].message)).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Suggest next steps' })).toBeTruthy()
  })

  it('requires explicit review, classification, response inspection, and plan creation', async () => {
    setOutcomeFlags(true)
    renderReviewer()

    expect(api.classifyCampaignGaps).not.toHaveBeenCalled()
    expect(createDevelopmentItem).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole('button', { name: 'Run the checks' }))
    const finding = await screen.findByRole('article')
    expect(within(finding).getByText(review.findings[0].message)).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'Suggest next steps' }))
    await waitFor(() =>
      expect(api.classifyCampaignGaps).toHaveBeenCalledWith('campaign-1'),
    )
    expect(await within(finding).findByText('Uncaptured evidence')).toBeTruthy()

    fireEvent.click(within(finding).getByText('Why?'))
    expect(
      within(finding).getByText(
        'classified:uncaptured_evidence:claim_present_unconfirmed',
      ),
    ).toBeTruthy()
    expect(api.getCampaignGapResponse).not.toHaveBeenCalled()

    fireEvent.click(within(finding).getByRole('button', { name: 'See what to do' }))
    await waitFor(() =>
      expect(api.getCampaignGapResponse).toHaveBeenCalledWith('campaign-1', 'gap-1'),
    )
    expect(await within(finding).findByText('Capture this as evidence')).toBeTruthy()
    expect(within(finding).getByText('Reduced migration time by 30%')).toBeTruthy()
    expect(within(finding).getByText(/Source: Inferred/)).toBeTruthy()
    expect(within(finding).getByText(/Not saved yet/)).toBeTruthy()
    expect(within(finding).getByText('None disclosed')).toBeTruthy()
    expect(createDevelopmentItem).not.toHaveBeenCalled()
    expect(api.setEvidenceItemConfirmation).not.toHaveBeenCalled()

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
    expect(api.setEvidenceItemConfirmation).not.toHaveBeenCalled()
    expect(
      within(finding).getByRole('button', { name: 'Added to your plan' }),
    ).toHaveProperty('disabled', true)
  })

  it('links the named first-party next step for a gap it cannot close', async () => {
    api.getCampaignGapResponse.mockResolvedValue(produceEvidenceResponse)
    setOutcomeFlags(true)
    renderReviewer()

    fireEvent.click(screen.getByRole('button', { name: 'Run the checks' }))
    const finding = await screen.findByRole('article')
    fireEvent.click(screen.getByRole('button', { name: 'Suggest next steps' }))
    await waitFor(() =>
      expect(api.classifyCampaignGaps).toHaveBeenCalledWith('campaign-1'),
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
    api.getCampaignGapResponse.mockResolvedValue({
      ...response,
      commercial_relationship: 'affiliate' as never,
    })
    setOutcomeFlags(true)
    renderReviewer()

    fireEvent.click(screen.getByRole('button', { name: 'Run the checks' }))
    const finding = await screen.findByRole('article')
    fireEvent.click(screen.getByRole('button', { name: 'Suggest next steps' }))
    await waitFor(() =>
      expect(api.classifyCampaignGaps).toHaveBeenCalledWith('campaign-1'),
    )
    fireEvent.click(within(finding).getByRole('button', { name: 'See what to do' }))

    expect(await within(finding).findByText('affiliate')).toBeTruthy()
    expect(within(finding).queryByText('None disclosed')).toBeNull()
  })

})

describe('CampaignChecklist', () => {
  beforeEach(() => {
    api.reviewCampaign.mockReset().mockResolvedValue(review)
    setOutcomeFlags(false)
  })

  afterEach(() => vi.unstubAllEnvs())

  function item(title: string) {
    return screen.getByText(title).closest('li') as HTMLElement
  }

  it('ticks off the basics from what the application already has', () => {
    renderReviewer({
      ...baseCampaign,
      listing: { title: 'Platform Engineer', company: 'Northstar', description: 'Own the platform.', source_url: null, retrieved_at: '2026-08-12T10:00:00Z' },
      selected_materials: { ...baseCampaign.selected_materials, cv_variant: { id: 'cv-1', document_id: 'doc-1', document_name: 'CV', name: 'Platform', target_role: null, created_at: '2026-08-12T10:00:00Z' } },
    })

    expect(within(item('The job posting is attached')).getByLabelText('Done')).toBeTruthy()
    expect(within(item("You've picked a CV version")).getByLabelText('Done')).toBeTruthy()
    expect(within(item("You've picked a cover letter")).getByLabelText('Needs a look')).toBeTruthy()
    // Content checks wait for the user to run them.
    expect(within(item('You cover what the job asks for')).getByLabelText('Not checked yet')).toBeTruthy()
    expect(api.reviewCampaign).not.toHaveBeenCalled()
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
    api.reviewCampaign.mockRejectedValueOnce(new Error('offline'))
    renderReviewer()
    fireEvent.click(screen.getByRole('button', { name: 'Run the checks' }))
    expect((await screen.findByRole('alert')).textContent).toBe("The checks couldn't run. Try again.")
  })
})

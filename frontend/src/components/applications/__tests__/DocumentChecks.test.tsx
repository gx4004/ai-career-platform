import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { DocumentChecks } from '#/components/applications/DocumentChecks'
import { ApiError } from '#/lib/api/errors'

// A finding is a flat row in its check's findings list (it was a Card, an <article>; Sticker keeps Cards for real
// objects such as a job or an application, and panel content stays flat).
const FINDINGS = /: findings$/

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
  // Props pass through so a kit Button asChild can put its classes on the link.
  Link: ({ to, children, ...rest }: { to: string; children: React.ReactNode }) => (
    <a href={to} {...rest}>{children}</a>
  ),
}))

beforeEach(() => localStorage.clear())

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
    const finding = await screen.findByRole('list', { name: FINDINGS })
    expect(within(finding).getByText(review.findings[0].message)).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'Suggest next steps' }))
    await waitFor(() =>
      expect(api.classifyApplicationGaps).toHaveBeenCalledWith('campaign-1'),
    )
    expect(await within(finding).findByText('Uncaptured evidence')).toBeTruthy()

    fireEvent.click(within(finding).getByText('Why?'))
    // F28: the trace reads as sentences, never the classifier's internal tokens.
    const why = within(finding).getByRole('list', { name: 'Why it counts as this kind of gap' })
    expect(Array.from(why.querySelectorAll('li'), (li) => li.textContent)).toEqual([
      'Your documents say “Reduced migration time by 30%”.',
      "Your CV and profile don't back it up.",
      "So it counts as evidence you have but haven't added to your profile yet.",
    ])
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

    // F35: "Add to my development plan" wrapped onto two lines at 320; the status line below still names the plan.
    fireEvent.click(within(finding).getByRole('button', { name: 'Add to my plan' }))
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
    const finding = await screen.findByRole('list', { name: FINDINGS })
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
    // F35: the source reads as a link (kit link button), not as plain indented text.
    expect(step.className).toContain('kit-button--link')
    // A step offer is a sub-heading inside the finding, a step below the panel's own heading (display 24 inverted it).
    expect(within(finding).getByRole('heading', { name: 'Plan a portfolio project' }).closest('.kit-section')?.getAttribute('data-size')).toBe('xs')
  })

  it('explains a missing skill in plain sentences and leaves out steps it has no words for', async () => {
    api.reviewApplication.mockResolvedValue({
      findings: [
        {
          id: 'finding-k8s',
          category: 'missed_requirement',
          severity: 'medium',
          message: 'The job asks for “Kubernetes”, but your CV and cover letter don\'t mention it.',
          locations: ['Job posting:chars 1-11:Kubernetes', 'CV:entire document', 'Cover letter:entire document'],
          trace: ['listing_requirement:Kubernetes', 'result:not_found_in_selected_materials'],
        },
      ],
    })
    api.classifyApplicationGaps.mockResolvedValue({
      schema_version: 'gap-classification/v1',
      classifications: [
        {
          ...classification,
          finding_id: 'finding-k8s',
          source_category: 'missed_requirement',
          gap_kind: 'missing_skill',
          cited_trace: [
            'listing_requirement:Kubernetes',
            'result:not_found_in_selected_materials',
            'some_future_step:whatever',
            'profile_lookup:Kubernetes:absent',
            'classified:missing_skill',
          ],
        },
      ],
    })
    renderReviewer()
    fireEvent.click(screen.getByRole('button', { name: 'Run the checks' }))
    const finding = await screen.findByRole('list', { name: FINDINGS })
    fireEvent.click(screen.getByRole('button', { name: 'Suggest next steps' }))
    fireEvent.click(await within(finding).findByText('Why?'))
    const why = within(finding).getByRole('list', { name: 'Why it counts as this kind of gap' })
    expect(Array.from(why.querySelectorAll('li'), (li) => li.textContent)).toEqual([
      'The job asks for Kubernetes.',
      // applications-discovery-F37: an application may have only a CV chosen, so the sentence names no cover letter.
      "The documents you chose don't mention it.",
      'Your profile has no entry for Kubernetes either.',
      'So it counts as a missing skill.',
    ])
    expect(within(finding).queryByText(/listing_requirement|profile_lookup|classified:|some_future_step/)).toBeNull()
  })

  it('names the profile section that already shows a requirement', async () => {
    api.classifyApplicationGaps.mockResolvedValue({
      schema_version: 'gap-classification/v1',
      classifications: [
        {
          ...classification,
          cited_trace: ['listing_requirement:Go', 'profile_lookup:Go:demonstrated_in:project', 'classified:uncaptured_evidence'],
        },
      ],
    })
    renderReviewer()
    fireEvent.click(screen.getByRole('button', { name: 'Run the checks' }))
    const finding = await screen.findByRole('list', { name: FINDINGS })
    fireEvent.click(screen.getByRole('button', { name: 'Suggest next steps' }))
    fireEvent.click(await within(finding).findByText('Why?'))
    const why = within(finding).getByRole('list', { name: 'Why it counts as this kind of gap' })
    expect(Array.from(why.querySelectorAll('li'), (li) => li.textContent)).toEqual([
      'The job asks for Go.',
      'Your profile already shows Go under Projects.',
      "So the proof exists; it just isn't in this application.",
    ])
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
    const finding = await screen.findByRole('list', { name: FINDINGS })
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

  it('says there is nothing to check once it was marked applied with no document attached, with no dead-end button', () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
    render(
      <QueryClientProvider client={queryClient}>
        <DocumentChecks applicationId="campaign-1" sent hasDocuments={false} />
      </QueryClientProvider>,
    )
    // The pickers above are locked once sent, so "Pick a CV version above" would send the owner nowhere.
    // Worded without "when you marked it applied", which is false for a send recorded after the card moved on (R2-F26).
    expect(screen.getByTestId('checks-idle').textContent).toBe('No CV or cover letter was in what you sent, so there is nothing to check.')
    expect(screen.queryByText(/Pick a CV version/)).toBeNull()
    expect(screen.queryByRole('button', { name: 'Run the checks' })).toBeNull()
  })

  it('waits for the owner to run the checks', () => {
    renderReviewer()
    expect(screen.getByTestId('checks-idle').textContent).toContain('6 checks, not run yet')
    expect(api.reviewApplication).not.toHaveBeenCalled()
  })

  it('files each finding under its check in plain words, and hides it on request', async () => {
    renderReviewer()
    fireEvent.click(screen.getByRole('button', { name: 'Run the checks' }))

    const finding = await screen.findByRole('list', { name: FINDINGS })
    const claims = item('Everything you claim is backed up')
    expect(within(claims).getByLabelText('Needs a look')).toBeTruthy()
    expect(within(claims).getByText(review.findings[0].message)).toBeTruthy()
    expect(within(finding).getByText('Where: Cover letter')).toBeTruthy()
    expect(within(item('Your documents agree')).getByLabelText('Done')).toBeTruthy()
    expect(screen.getByText('1 thing to look at')).toBeTruthy()

    // F35: a bare "Hide" did not say what it hides.
    fireEvent.click(within(finding).getByRole('button', { name: 'Hide this finding' }))
    expect(screen.queryByRole('list', { name: FINDINGS })).toBeNull()
    expect(screen.getByText('You hid everything the checks found.')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Check again' })).toBeTruthy()
  })

  it('says so plainly when the checks cannot run', async () => {
    api.reviewApplication.mockRejectedValueOnce(new ApiError('Add the job posting before checking', 409))
    renderReviewer()
    fireEvent.click(screen.getByRole('button', { name: 'Run the checks' }))
    expect((await screen.findByRole('alert')).textContent).toBe('Add the job posting before checking')
  })
  it('remembers a hidden finding for this application after a reload, and shows how many checks are clear', async () => {
    const first = renderReviewer()
    fireEvent.click(screen.getByRole('button', { name: 'Run the checks' }))
    expect(await screen.findByRole('meter', { name: '5 of 6 checks clear' })).toBeTruthy()
    fireEvent.click(within(await screen.findByRole('list', { name: FINDINGS })).getByRole('button', { name: 'Hide this finding' }))
    // Hiding tidies the list; it does not make the check pass.
    expect(screen.getByRole('meter', { name: '5 of 6 checks clear' })).toBeTruthy()
    first.unmount()

    renderReviewer()
    fireEvent.click(screen.getByRole('button', { name: 'Run the checks' }))
    await screen.findByText('You hid everything the checks found.')
    expect(screen.queryByRole('list', { name: FINDINGS })).toBeNull()
  })

  // A near-empty document gives the content checks nothing to read: they must not tick "pass" beside the warning.
  const emptyDefect = (document: 'CV' | 'Cover letter') => ({
    id: `empty-${document}`,
    category: 'document_defect',
    severity: 'medium',
    message: document === 'CV' ? 'Your CV looks almost empty.' : 'Your cover letter is very short.',
    locations: [`${document}:entire document`],
    trace: ['visible_characters:0'],
  })

  it('leaves the content checks unchecked, and out of the tally, when both documents are near-empty', async () => {
    api.reviewApplication.mockResolvedValue({ findings: [emptyDefect('CV'), emptyDefect('Cover letter')] })
    renderReviewer()
    fireEvent.click(screen.getByRole('button', { name: 'Run the checks' }))

    expect(await screen.findByRole('meter', { name: '1 of 2 checks clear' })).toBeTruthy()
    for (const title of ['Everything you claim is backed up', 'Your documents agree', 'No stock phrases', 'Nothing is repeated']) {
      expect(within(item(title)).getByLabelText('Not checked')).toBeTruthy()
      expect(within(item(title)).getByText('Not checked: add content first.')).toBeTruthy()
      expect(within(item(title)).queryByLabelText('Done')).toBeNull()
    }
    expect(within(item('You cover what the job asks for')).getByLabelText('Done')).toBeTruthy()
    expect(within(item('No placeholders or near-empty documents')).getByLabelText('Needs a look')).toBeTruthy()
  })

  it('only skips the CV-against-cover-letter check when just one document is near-empty', async () => {
    api.reviewApplication.mockResolvedValue({ findings: [emptyDefect('Cover letter')] })
    renderReviewer()
    fireEvent.click(screen.getByRole('button', { name: 'Run the checks' }))

    expect(await screen.findByRole('meter', { name: '4 of 5 checks clear' })).toBeTruthy()
    expect(within(item('Your documents agree')).getByLabelText('Not checked')).toBeTruthy()
    expect(within(item('No stock phrases')).getByLabelText('Done')).toBeTruthy()
  })

  // The review names the documents chosen (BT-1): a check that compares the two is not a vacuous pass when only one
  // was chosen, and the placeholder check does not claim "both documents" have content.
  it('leaves the comparison unchecked, and out of the tally, when no cover letter was chosen', async () => {
    api.reviewApplication.mockResolvedValue({ documents: { cv: true, cover_letter: false }, findings: [] })
    renderReviewer()
    fireEvent.click(screen.getByRole('button', { name: 'Run the checks' }))

    expect(await screen.findByRole('meter', { name: '5 of 5 checks clear' })).toBeTruthy()
    const agree = item('Your documents agree')
    expect(within(agree).getByLabelText('Not checked')).toBeTruthy()
    expect(within(agree).getByText('Not checked: no cover letter chosen.')).toBeTruthy()
    expect(within(item('No stock phrases')).getByLabelText('Done')).toBeTruthy()
    const defects = item('No placeholders or near-empty documents')
    expect(within(defects).getByText('No leftover [Company] or TODO, and your CV has real content.')).toBeTruthy()
  })

  it('names the missing CV when only a cover letter was chosen', async () => {
    api.reviewApplication.mockResolvedValue({ documents: { cv: false, cover_letter: true }, findings: [] })
    renderReviewer()
    fireEvent.click(screen.getByRole('button', { name: 'Run the checks' }))

    expect(await screen.findByRole('meter', { name: '5 of 5 checks clear' })).toBeTruthy()
    expect(within(item('Your documents agree')).getByText('Not checked: no CV chosen.')).toBeTruthy()
    expect(
      within(item('No placeholders or near-empty documents')).getByText('No leftover [Company] or TODO, and your cover letter has real content.'),
    ).toBeTruthy()
  })

  it('quotes the exact words a finding points at, highlighted', async () => {
    api.reviewApplication.mockResolvedValue({
      findings: [{ ...review.findings[0], locations: ['Cover letter:chars 20-45:Reduced migration time by 30%'] }],
    })
    renderReviewer()
    fireEvent.click(screen.getByRole('button', { name: 'Run the checks' }))

    const quote = await screen.findByText('Reduced migration time by 30%')
    expect(quote.tagName).toBe('MARK')
    expect(quote.closest('li')?.textContent).toContain('Cover letter')
  })
})

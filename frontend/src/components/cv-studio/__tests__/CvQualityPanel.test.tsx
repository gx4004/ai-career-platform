import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { CvQualityPanel } from '#/components/cv-studio/CvQualityPanel'
import type { CvQualityResponse } from '#/lib/api/schemas'

const api = vi.hoisted(() => ({ scoreCvDocument: vi.fn() }))
vi.mock('#/lib/api/client', () => api)

const quality: CvQualityResponse = {
  schema_version: 'cv-quality/v1', scoring_mode: 'heuristic', remaining_model_runs: 10,
  advisory_note: 'Quality scores are directional editing guidance. Compatibility checks report only named structural properties.',
  dimensions: [{ key: 'impact', label: 'Evidence of impact', score: 64, reasons: ['Two entries include outcomes.'], remediation: 'Add truthful measurements.' }],
  ats_checks: [
    { key: 'section_structure', label: 'Section structure', status: 'review', explanation: 'Two sections share a heading.', remediation: 'Give each section a distinct heading.' },
    { key: 'text_layer', label: 'Text layer', status: 'fail', explanation: 'The export has no selectable text.', remediation: 'Re-export from a studio template.' },
  ],
  history_id: 'h1', access_mode: 'authenticated', saved: true, locked_actions: [],
}

function view() {
  return render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })}>
    <CvQualityPanel documentId="d1" revision="2026-07-12T10:00:00Z" artifactTemplate="professional-editorial" />
  </QueryClientProvider>)
}

function checkCard(label: string) {
  return screen.getByRole('heading', { name: label, level: 4 }).closest('article') as HTMLElement
}

beforeEach(() => {
  vi.clearAllMocks()
  api.scoreCvDocument.mockResolvedValue(quality)
})

describe('CV quality panel', () => {
  it('validates an artifact-bound check against the rendered template and patches only that row', async () => {
    api.scoreCvDocument.mockResolvedValueOnce(quality).mockResolvedValueOnce({
      ...quality,
      ats_checks: [{ key: 'text_layer', label: 'Text layer', status: 'pass', explanation: 'Every glyph is selectable.', remediation: 'Re-export from a studio template.' }],
    })
    view()

    fireEvent.click(await screen.findByRole('button', { name: 'Validate PDF Text layer' }))

    await waitFor(() => expect(api.scoreCvDocument).toHaveBeenLastCalledWith('d1', {
      use_model: false, checks: ['text_layer'],
      artifact_template: 'professional-editorial', artifact_format: 'pdf',
    }))
    await waitFor(() => expect(within(checkCard('Text layer')).getByText('pass')).toBeTruthy())
    expect(within(checkCard('Text layer')).getByText('Every glyph is selectable.')).toBeTruthy()
    // The untouched deterministic check keeps its own earlier verdict.
    expect(within(checkCard('Section structure')).getByText('review')).toBeTruthy()
    expect(within(checkCard('Section structure')).getByText('Two sections share a heading.')).toBeTruthy()
  })

  it('reruns the structural check without an artifact, because it reads the document not the export', async () => {
    view()

    fireEvent.click(await screen.findByRole('button', { name: 'Rerun Section structure' }))

    await waitFor(() => expect(api.scoreCvDocument).toHaveBeenLastCalledWith('d1', {
      use_model: false, checks: ['section_structure'],
    }))
  })

  it('keeps the previous verdict visible when a rerun fails', async () => {
    api.scoreCvDocument.mockResolvedValueOnce(quality).mockRejectedValueOnce(new Error('Artifact export failed'))
    view()

    fireEvent.click(await screen.findByRole('button', { name: 'Validate PDF Text layer' }))

    const card = checkCard('Text layer')
    expect((await within(card).findByRole('alert')).textContent).toContain('This check could not be rerun. The previous result remains visible.')
    expect(within(card).getByText('fail')).toBeTruthy()
    expect(within(card).getByText('The export has no selectable text.')).toBeTruthy()
  })

  it('folds an added model perspective into the visible scores and run budget', async () => {
    api.scoreCvDocument.mockResolvedValueOnce(quality).mockResolvedValueOnce({
      ...quality, scoring_mode: 'blended', remaining_model_runs: 9,
      dimensions: [{ key: 'impact', label: 'Evidence of impact', score: 71, reasons: ['The model agreed on two outcomes.'], remediation: 'Quantify the migration entry.' }],
    })
    view()

    fireEvent.click(await screen.findByRole('button', { name: 'Add model perspective' }))

    await waitFor(() => expect(api.scoreCvDocument).toHaveBeenLastCalledWith('d1', { use_model: true }))
    expect(await screen.findByText('The model agreed on two outcomes.')).toBeTruthy()
    expect(screen.getByText('9 model scoring runs remain for this document.')).toBeTruthy()
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('offers a retry instead of guidance when the first load fails', async () => {
    api.scoreCvDocument.mockRejectedValueOnce(new Error('Quality scoring is unavailable')).mockResolvedValueOnce(quality)
    view()

    expect((await screen.findByRole('alert')).textContent).toContain('Quality guidance could not be loaded. Your document was not changed.')
    expect(screen.queryByText('Evidence of impact')).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: 'Try again' }))

    expect(await screen.findByText('Evidence of impact')).toBeTruthy()
    expect(screen.getByText('Two entries include outcomes.')).toBeTruthy()
  })
})

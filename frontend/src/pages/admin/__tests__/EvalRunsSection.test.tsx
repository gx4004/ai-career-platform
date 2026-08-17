import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { AdminEvalRuns, EvalRunItem } from '#/lib/api/admin'
import { EvalRunsSection } from '#/pages/admin/admin-activation-page'

// R8 #124: the Eval Runs section reads the latest report per tool from disk via
// the admin endpoint and renders it beside the per-tool latency/cost view. This
// test drives the section with a FIXTURE-SHAPED FAKE report payload (not a live
// eval run), covering a calibration tool, a generative tool, and the explicit
// "no eval run yet" empty state.

const getAdminEvalRunsMock = vi.hoisted(() => vi.fn())

vi.mock('#/lib/api/admin', () => ({
  getAdminEvalRuns: getAdminEvalRunsMock,
}))

function evalItem(overrides: Partial<EvalRunItem> & { tool_id: string }): EvalRunItem {
  return {
    has_report: false,
    report_schema_version: null,
    prompt_version: null,
    judge_prompt_version: null,
    generated_at: null,
    mode: null,
    fixtures_evaluated: null,
    calibration_miss_rate: null,
    explanation_inconsistency_count: null,
    fabrication_candidate_count: null,
    usefulness_score: null,
    ...overrides,
  }
}

function renderSection(payload: AdminEvalRuns) {
  getAdminEvalRunsMock.mockResolvedValue(payload)
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={client}>
      <EvalRunsSection />
    </QueryClientProvider>,
  )
}

describe('EvalRunsSection', () => {
  it('renders the latest report per tool: calibration and generative metrics', async () => {
    renderSection({
      tools: [
        evalItem({
          tool_id: 'resume',
          has_report: true,
          report_schema_version: 'r8-eval-report-v2',
          prompt_version: 'resume-v3',
          generated_at: '2026-07-09T12:00:00+00:00',
          mode: 'deterministic',
          fixtures_evaluated: 11,
          calibration_miss_rate: 0.09,
          explanation_inconsistency_count: 2,
        }),
        evalItem({
          tool_id: 'cover-letter',
          has_report: true,
          prompt_version: 'cover-v2',
          generated_at: '2026-07-09T12:00:00+00:00',
          mode: 'live',
          fixtures_evaluated: 8,
          fabrication_candidate_count: 3,
          usefulness_score: 4.25,
        }),
      ],
    })

    // Calibration tool shows a miss rate plus the explanation inconsistency
    // count; generative tool shows fabrication + usefulness. Prompt versions
    // render for both.
    expect(await screen.findByText('Miss rate 9.0% · Explanation 2')).toBeTruthy()
    expect(screen.getByText('Fabrication 3 · Usefulness 4.25/5')).toBeTruthy()
    expect(screen.getByText('resume-v3')).toBeTruthy()
    expect(screen.getByText('cover-v2')).toBeTruthy()
  })

  it('omits the explanation figure for a report written before that check existed', async () => {
    // A `r8-eval-report-v1` artifact carries no explanation count. Absent means
    // "not measured", so the cell must not imply zero contradictions.
    renderSection({
      tools: [
        evalItem({
          tool_id: 'job-match',
          has_report: true,
          report_schema_version: 'r8-eval-report-v1',
          prompt_version: 'job-match-v3',
          generated_at: '2026-07-09T12:00:00+00:00',
          mode: 'deterministic',
          fixtures_evaluated: 9,
          calibration_miss_rate: 0.22,
          explanation_inconsistency_count: null,
        }),
      ],
    })

    expect(await screen.findByText('Miss rate 22.0%')).toBeTruthy()
    expect(screen.queryByText(/Explanation/)).toBeNull()
  })

  it('renders a zero explanation count as measured, not absent', async () => {
    renderSection({
      tools: [
        evalItem({
          tool_id: 'job-match',
          has_report: true,
          report_schema_version: 'r8-eval-report-v2',
          prompt_version: 'job-match-v3',
          generated_at: '2026-07-09T12:00:00+00:00',
          mode: 'deterministic',
          fixtures_evaluated: 9,
          calibration_miss_rate: 0.22,
          explanation_inconsistency_count: 0,
        }),
      ],
    })

    expect(await screen.findByText('Miss rate 22.0% · Explanation 0')).toBeTruthy()
  })

  it('shows an explicit "no eval run yet" state for a tool with no report', async () => {
    renderSection({
      tools: [evalItem({ tool_id: 'portfolio', has_report: false })],
    })

    await waitFor(() => {
      expect(screen.getByText('No eval run yet')).toBeTruthy()
    })
    // The empty state is not an error.
    expect(screen.queryByText('Failed to load eval runs.')).toBeNull()
  })
})

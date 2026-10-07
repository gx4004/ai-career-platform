import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import {
  countOf,
  breakdownInsight,
  careerStartLine,
  careerVerdict,
  FixFirstList,
  formatLetterDate,
  lowestTwo,
  resultDefinitions,
  roleFitLabel,
  roleFitLevel,
  uniqueRequirementCount,
} from '#/lib/tools/resultDefinitions'
import { tools } from '#/lib/tools/registry'
import { ResultChromeContext } from '#/components/tooling/ResultParts'
import { ClaimPromotionSection } from '#/components/profile/ClaimPromotionSection'
import { EVIDENCE_QUERY_KEY } from '#/lib/query/evidenceCaches'
import type { ToolRunDetail } from '#/lib/api/schemas'

function makeItem(toolName: string, resultPayload: Record<string, unknown>): ToolRunDetail {
  return {
    id: 'run-1',
    tool_name: toolName,
    label: 'Saved run',
    is_favorite: false,
    created_at: '2026-03-13T10:00:00Z',
    saved: true,
    access_mode: 'authenticated',
    locked_actions: [],
    metadata: {
      summary_headline: null,
      primary_recommendation_title: null,
      schema_version: 'quality_v2',
      linked_context_ids: [],
      next_step_tool: null,
    },
    result_payload: resultPayload,
  }
}

describe('resultDefinitions', () => {
  it('renders upgraded resume quality output with issue cards and role fit', () => {
    const payload = {
      history_id: 'r1',
      schema_version: 'quality_v2',
      summary: {
        headline: 'The next revision should close the biggest keyword and evidence gaps.',
        verdict: 'Promising but uneven',
        confidence_note: 'Directional heuristic based on the resume text.',
      },
      top_actions: [
        {
          title: 'Add metrics',
          action: 'Rewrite two bullets with measurable outcomes.',
          priority: 'high',
        },
      ],
      generated_at: '2026-03-13T10:00:00Z',
      download_title: 'Backend Engineer revision kit',
      exportable_sections: [],
      editable_blocks: [
        {
          id: 'impact-1',
          label: 'Rewrite block 1',
          content: 'Rewrite direction',
        },
      ],
      overall_score: 78,
      score_breakdown: [
        { key: 'keywords', label: 'Keyword alignment', score: 72 },
        { key: 'impact', label: 'Impact evidence', score: 60 },
        { key: 'structure', label: 'Structure', score: 82 },
        { key: 'clarity', label: 'Clarity', score: 79 },
        { key: 'completeness', label: 'Completeness', score: 85 },
      ],
      strengths: ['Clear sectioning makes the resume easy to scan.'],
      issues: [
        {
          id: 'impact-1',
          severity: 'high',
          category: 'impact',
          title: 'Impact is not backed up with enough measurable results',
          why_it_matters: 'Numbers improve trust.',
          evidence: 'Only one quantified bullet was detected.',
          fix: 'Add scope, speed, or outcome metrics to the strongest bullets.',
        },
      ],
      evidence: {
        detected_sections: ['Summary', 'Experience', 'Skills', 'Education'],
        detected_skills: ['Python', 'SQL', 'FastAPI'],
        matched_keywords: ['Python', 'SQL'],
        missing_keywords: ['Docker'],
        quantified_bullets: 1,
      },
      role_fit: {
        target_role_label: 'Backend Engineer',
        fit_score: 74,
        rationale: 'The resume matches the core backend stack but needs clearer deployment evidence.',
      },
    }

    render(resultDefinitions.resume.render(payload, makeItem('resume', payload), tools.resume))

    expect(screen.getByText('Major strengths')).toBeTruthy()
    expect(screen.getByText('Refinement areas')).toBeTruthy()
    expect(screen.queryByText('Detailed feedback')).toBeNull()
    expect(screen.getByText(/Keyword optimization/i)).toBeTruthy()
    expect(screen.getByText(/Role fit/i)).toBeTruthy()
    expect(screen.getAllByText(/Impact is not backed up with enough measurable results/i).length).toBeGreaterThan(0)
    expect(screen.getByText(/Docker/i)).toBeTruthy()
  })

  it('renders upgraded job match output with requirement states and interview handoff', () => {
    const payload = {
      history_id: 'j1',
      schema_version: 'quality_v2',
      summary: {
        headline: 'The foundation is there, but the resume still needs stronger proof for Kubernetes.',
        verdict: 'borderline',
        confidence_note: 'Directional heuristic based on overlap.',
      },
      top_actions: [
        {
          title: 'Tailor Kubernetes evidence',
          action: 'Add one deployment bullet that proves orchestration ownership.',
          priority: 'high',
        },
      ],
      generated_at: '2026-03-13T10:00:00Z',
      match_score: 68,
      verdict: 'borderline',
      requirements: [
        {
          requirement: 'Python',
          importance: 'must',
          status: 'matched',
          resume_evidence: 'Python appears in skills and experience.',
          suggested_fix: 'Keep it visible in the strongest impact bullet.',
        },
        {
          requirement: 'Kubernetes',
          importance: 'preferred',
          status: 'missing',
          resume_evidence: 'No orchestration example was detected.',
          suggested_fix: 'Add one project or production example with outcome.',
        },
      ],
      matched_keywords: ['Python', 'SQL', 'FastAPI'],
      missing_keywords: ['Kubernetes'],
      tailoring_actions: [
        {
          section: 'experience',
          keyword: 'Kubernetes',
          action: 'Add a deployment-focused bullet in experience with outcome and scope.',
        },
      ],
      interview_focus: ['How you would approach container orchestration in production.'],
      recruiter_summary: 'Strong backend baseline with one obvious infrastructure gap.',
    }

    render(
      resultDefinitions['job-match'].render(
        payload,
        makeItem('job-match', payload),
        tools['job-match'],
      ),
    )

    expect(screen.getByText(/Detailed requirements/i)).toBeTruthy()
    expect(screen.getByText(/Keyword breakdown/i)).toBeTruthy()
    expect(screen.getAllByText(/Kubernetes/i).length).toBeGreaterThan(0)
    expect(screen.getByText(/Recruiter summary/i)).toBeTruthy()
  })

  it('renders upgraded cover letter output with editable draft blocks and notes', () => {
    const payload = {
      history_id: 'c1',
      schema_version: 'quality_v2',
      summary: {
        headline: 'The draft is targeted and ready for a stronger evidence pass.',
        verdict: 'Application-ready draft',
        confidence_note: 'Advisory draft based on resume and role context.',
      },
      top_actions: [
        {
          title: 'Strengthen Kubernetes evidence',
          action: 'Bring a deployment example into the main proof paragraph.',
          priority: 'high',
        },
      ],
      generated_at: '2026-03-13T10:00:00Z',
      opening: {
        text: 'Dear Hiring Manager, I am excited to apply.',
        why_this_paragraph: 'Connect fit quickly.',
        requirements_used: ['Python', 'SQL'],
        evidence_used: ['Built APIs for customer teams.'],
      },
      body_points: [
        {
          text: 'I have built backend services with measurable impact.',
          why_this_paragraph: 'Show proof.',
          requirements_used: ['AWS', 'Kubernetes'],
          evidence_used: ['Improved reliability by 20%.'],
        },
      ],
      closing: {
        text: 'Thank you for your consideration.',
        why_this_paragraph: 'Close confidently.',
        requirements_used: ['Backend Engineer'],
        evidence_used: [],
      },
      full_text: 'Dear Hiring Manager...\n\nThank you for your consideration.',
      tone_used: 'Professional',
      customization_notes: [
        {
          category: 'keyword',
          note: 'Make Kubernetes ownership more explicit.',
          requirements_used: ['Kubernetes'],
          source: 'job-match',
        },
      ],
    }

    render(
      resultDefinitions['cover-letter'].render(
        payload,
        makeItem('cover-letter', payload),
        tools['cover-letter'],
      ),
    )

    expect(screen.getByText(/Customization notes/i)).toBeTruthy()
    expect(screen.getByDisplayValue(/Dear Hiring Manager/i)).toBeTruthy()
    expect(screen.getAllByText(/Kubernetes/i).length).toBeGreaterThan(0)
  })

  it('renders upgraded interview output with focus areas and gap-first practice', () => {
    const payload = {
      history_id: 'i1',
      schema_version: 'quality_v2',
      summary: {
        headline: 'Start with the weak-signal topics first.',
        verdict: 'Gap-first practice plan',
        confidence_note: 'Advisory practice plan based on resume and role context.',
      },
      top_actions: [
        {
          title: 'Prepare Kubernetes',
          action: 'Practice one concrete infrastructure example.',
          priority: 'high',
        },
      ],
      generated_at: '2026-03-13T10:00:00Z',
      download_title: 'Interview practice packet',
      exportable_sections: [],
      editable_blocks: [
        {
          id: 'answer-1',
          label: 'How would you talk about Kubernetes readiness?',
          content: 'I would connect adjacent deployment work to concrete orchestration decisions.',
        },
      ],
      questions: [
        {
          question: 'How would you talk about Kubernetes readiness?',
          answer: 'I would connect adjacent deployment work to concrete orchestration decisions.',
          key_points: ['Deployment ownership'],
          answer_structure: ['Context', 'Approach', 'Outcome'],
          follow_up_questions: ['What changed because of your work?'],
          focus_area: 'Kubernetes',
          why_asked: 'This tests whether the gap is bridgeable.',
          practice_first: true,
        },
      ],
      focus_areas: [
        {
          title: 'Kubernetes',
          reason: 'This is one of the clearest missing proofs.',
          requirements_used: ['Kubernetes'],
          practice_first: true,
        },
      ],
      weak_signals_to_prepare: [
        {
          title: 'Kubernetes',
          severity: 'high',
          why_it_matters: 'No direct orchestration example is visible.',
          prep_action: 'Prepare one adjacent infrastructure example.',
          related_requirements: ['Kubernetes'],
        },
      ],
      interviewer_notes: ['Lead with your strongest API story first.'],
    }

    render(
      resultDefinitions.interview.render(
        payload,
        makeItem('interview', payload),
        tools.interview,
      ),
    )

    expect(screen.getByText(/Question breakdown/i)).toBeTruthy()
    expect(screen.getByText(/Weak signals/i)).toBeTruthy()
    expect(screen.getAllByText(/Kubernetes/i).length).toBeGreaterThan(0)
    expect(screen.getByText(/Interviewer notes/i)).toBeTruthy()
  })

  it('renders upgraded career output with a hero recommendation, urgency-grouped gaps, and timeline', () => {
    const payload = {
      history_id: 'c1',
      schema_version: 'planning_v1',
      summary: {
        headline: 'The clearest next move is Senior Backend Engineer.',
        verdict: 'Best next move identified',
        confidence_note: 'Advisory planning output only.',
      },
      top_actions: [
        {
          title: 'Build proof next',
          action: 'Open Portfolio Planner to turn the top gaps into a public proof project.',
          priority: 'medium',
        },
      ],
      generated_at: '2026-03-13T10:00:00Z',
      recommended_direction: {
        role_title: 'Senior Backend Engineer',
        fit_score: 81,
        transition_timeline: '3-6 months',
        confidence: 'medium',
      },
      paths: [
        {
          role_title: 'Platform Engineer',
          fit_score: 74,
          transition_timeline: '3-6 months',
          strengths_to_leverage: ['Python', 'APIs'],
          gaps_to_close: ['Observability', 'Infrastructure automation'],
          risk_level: 'medium',
        },
      ],
      current_skills: ['Python', 'SQL', 'APIs'],
      target_skills: ['System Design', 'Observability'],
      skill_gaps: [
        {
          skill: 'Leadership',
          urgency: 'high',
          why_it_matters: 'Senior-level roles need broader scope evidence.',
          how_to_build: 'Lead one cross-team initiative and document the outcome.',
        },
      ],
      next_steps: [
        {
          timeframe: 'Next 30 days',
          action: 'Add one proof point that shows broader ownership.',
        },
      ],
    }

    render(resultDefinitions.career.render(payload, makeItem('career', payload), tools.career))

    expect(screen.getByText(/Senior Backend Engineer/i)).toBeTruthy()
    expect(screen.getByText(/Alternative paths/i)).toBeTruthy()
    expect(screen.getByText(/Critical skill gaps/i)).toBeTruthy()
    expect(screen.getByText(/step roadmap/i)).toBeTruthy()
    expect(screen.getAllByText(/Senior Backend Engineer/i).length).toBeGreaterThan(0)
  })

  it('renders upgraded portfolio output with start-here guidance and project roadmap details', () => {
    const payload = {
      history_id: 'p1',
      schema_version: 'planning_v1',
      summary: {
        headline: 'Start with Operational Intake Service to build the fastest credible proof.',
        verdict: 'Proof roadmap ready',
        confidence_note: 'Advisory planning output only.',
      },
      top_actions: [
        {
          title: 'Start here',
          action: 'Ship the first project before you expand scope.',
          priority: 'high',
        },
      ],
      generated_at: '2026-03-13T10:00:00Z',
      target_role: 'Backend Engineer',
      portfolio_strategy: {
        headline: 'Build a compact backend proof set.',
        focus: 'Prioritize operational backend work over generic side projects.',
        proof_goal: 'Make the role feel credible before interviews.',
      },
      projects: [
        {
          project_title: 'Operational Intake Service',
          description: 'Build a production-leaning backend workflow.',
          skills: ['APIs', 'Testing'],
          complexity: 'foundational',
          deliverables: ['README', 'Deployed service'],
          hiring_signals: ['API design', 'Operational clarity'],
          estimated_timeline: '2-3 weeks',
        },
      ],
      recommended_start_project: 'Operational Intake Service',
      sequence_plan: [
        {
          order: 1,
          project_title: 'Operational Intake Service',
          reason: 'It creates the fastest credible backend proof.',
        },
      ],
      presentation_tips: ['Explain the trade-offs, not just the feature list.'],
    }

    render(resultDefinitions.portfolio.render(payload, makeItem('portfolio', payload), tools.portfolio))

    expect(screen.getByText(/The build sequence/i)).toBeTruthy()
    expect(screen.getByText(/Presentation tips/i)).toBeTruthy()
    expect(screen.getAllByText(/Operational Intake Service/i).length).toBeGreaterThan(0)
    expect(screen.getByText(/Strategy/i)).toBeTruthy()
  })

  it('puts "Start here" on the recommended project even when the plan lists another first', () => {
    const project = (title: string, complexity: string) => ({
      project_title: title,
      description: 'd',
      skills: [],
      complexity,
      deliverables: [],
      hiring_signals: [],
      estimated_timeline: '1 week',
    })
    const payload = {
      history_id: 'p2',
      generated_at: '2026-03-13T10:00:00Z',
      target_role: 'Backend Engineer',
      portfolio_strategy: { headline: 'h', focus: 'f' },
      projects: [project('Advanced Thing', 'intermediate'), project('Proof Project', 'foundational')],
      recommended_start_project: 'Proof Project',
      sequence_plan: [
        { order: 1, project_title: 'Advanced Thing', reason: 'a' },
        { order: 2, project_title: 'Proof Project', reason: 'b' },
      ],
    }
    render(resultDefinitions.portfolio.render(payload, makeItem('portfolio', payload), tools.portfolio))
    const steps = screen.getAllByRole('listitem').filter((li) => li.classList.contains('result-path__step'))
    expect(steps[0].textContent).not.toContain('Start here')
    expect(steps[1].textContent).toContain('Start here')
  })
})

describe('cover letter helpers', () => {
  const now = new Date('2026-09-30T12:00:00Z')

  it('formats a valid ISO timestamp as a long date', () => {
    expect(formatLetterDate('2026-03-13T10:00:00Z', now)).toBe('March 13, 2026')
  })

  it('falls back to today for invalid or empty values', () => {
    expect(formatLetterDate('not a date', now)).toBe('September 30, 2026')
    expect(formatLetterDate('', now)).toBe('September 30, 2026')
    expect(formatLetterDate(undefined, now)).toBe('September 30, 2026')
  })

  it('counts unique requirements across opening, body points and closing', () => {
    expect(
      uniqueRequirementCount({
        opening: { requirementsUsed: ['React', 'Testing'] },
        bodyPoints: [{ requirementsUsed: ['react', 'APIs'] }, { requirementsUsed: [] }],
        closing: { requirementsUsed: ['Testing', ' '] },
      }),
    ).toBe(3)
    expect(
      uniqueRequirementCount({ opening: { requirementsUsed: [] }, bodyPoints: [], closing: { requirementsUsed: [] } }),
    ).toBe(0)
  })

  it('copies and downloads the edited letter, not the generated one', () => {
    const payload = {
      opening: { text: 'Dear team,' },
      body_points: [{ text: 'Original body.' }],
      closing: { text: 'Thanks.' },
      generated_at: '2026-03-13T10:00:00Z',
    }
    const item = makeItem('cover-letter', payload)
    const definition = resultDefinitions['cover-letter']
    render(<>{definition.render(payload, item, tools['cover-letter'])}</>)

    fireEvent.change(screen.getByLabelText('Body paragraph 1'), { target: { value: 'Edited body.' } })

    expect(definition.copyText(payload, item)).toContain('Edited body.')
    expect(definition.copyText(payload, item)).not.toContain('Original body.')
    expect(definition.download?.(payload, item)?.content).toContain('Edited body.')
    expect(screen.getByText('March 13, 2026')).toBeTruthy()
    expect(screen.getByLabelText('Opening paragraph')).toBeTruthy()
    expect(screen.getByLabelText('Closing paragraph')).toBeTruthy()
  })

  it('keeps the sign-off on screen and in the copied, edited and downloaded letter', () => {
    const payload = {
      opening: { text: 'Dear team,' },
      body_points: [{ text: 'Original body.' }],
      closing: { text: 'Thanks.' },
      sign_off: 'Sincerely,\nJordan Rivera',
      generated_at: '2026-03-13T10:00:00Z',
    }
    const definition = resultDefinitions['cover-letter']
    const fresh = makeItem('cover-letter', payload)
    expect(definition.copyText(payload, fresh)).toMatch(/Thanks\.\n\nSincerely,\nJordan Rivera$/)

    const item = makeItem('cover-letter', payload)
    render(<>{definition.render(payload, item, tools['cover-letter'])}</>)
    expect(screen.getByText(/Jordan Rivera/)).toBeTruthy()
    expect(screen.queryByText(/\[Your name\]/)).toBeNull()
    fireEvent.change(screen.getByLabelText('Body paragraph 1'), { target: { value: 'Edited body.' } })
    expect(definition.copyText(payload, item)).toMatch(/Edited body\.\n\nThanks\.\n\nSincerely,\nJordan Rivera$/)
    expect(definition.download?.(payload, item)?.content).toContain('Jordan Rivera')
  })
})

// Sign-off tool-results-F59: a letter without a sign-off is signed with the signed-in person's name, on the page and
// in what Copy and Export hand over; the "[Your name]" placeholder is only for a guest or an account without a name.
describe('cover letter sign-off', () => {
  const payload = {
    opening: { text: 'Dear team,' },
    body_points: [{ text: 'Body.' }],
    closing: { text: 'Thanks.' },
    generated_at: '2026-03-13T10:00:00Z',
  }

  it("signs with the account's name when the letter has no sign-off", () => {
    const item = { ...makeItem('cover-letter', payload), id: 'run-signed' }
    const definition = resultDefinitions['cover-letter']
    render(
      <ResultChromeContext.Provider value={{ setPracticing: () => {}, reveal: false, signerName: 'Tess Throwaway' }}>
        {definition.render(payload, item, tools['cover-letter'])}
      </ResultChromeContext.Provider>,
    )
    expect(document.querySelector('.result-sheet__sign')?.textContent).toBe('Sincerely,Tess Throwaway')
    expect(screen.queryByText(/\[Your name\]/)).toBeNull()
    expect(definition.copyText(payload, item)).toMatch(/Thanks\.\n\nSincerely,\nTess Throwaway$/)
    expect(definition.download?.(payload, item)?.content).toMatch(/Sincerely,\nTess Throwaway$/)
  })

  it('keeps the placeholder for a guest, on the page and in the copy alike', () => {
    const item = { ...makeItem('cover-letter', payload), id: 'run-guest' }
    const definition = resultDefinitions['cover-letter']
    render(<>{definition.render(payload, item, tools['cover-letter'])}</>)
    expect(document.querySelector('.result-sheet__sign')?.textContent).toBe('Sincerely,[Your name]')
    expect(definition.copyText(payload, item)).toMatch(/Sincerely,\n\[Your name\]$/)
  })
})

// Sign-off tool-results-F58: the Career report closed on a canned "Note" ("...to maximize your timeline"). Its
// replacement is read from the payload: the most urgent gap and the timeline, or nothing at all.
describe('careerStartLine', () => {
  const gap = (skill: string, urgency: string) => ({ skill, urgency })

  it('names the most urgent gap and the timeline', () => {
    expect(careerStartLine([gap('Delegation', 'medium'), gap('Cloud Architecture', 'high'), gap('SQL', 'low')], '0-3 months')).toBe(
      'Start with Cloud Architecture: it is the most urgent of the 3 skill gaps above. The move is estimated at 0-3 months.',
    )
  })

  it('takes the first listed among equally urgent gaps, and says so', () => {
    expect(careerStartLine([gap('Delegation', 'high'), gap('Strategy', 'high')], '6-12 months')).toBe(
      'Start with Delegation: it is listed first of the 2 high-urgency gaps above. The move is estimated at 6-12 months.',
    )
  })

  it('handles one gap, a missing timeline, and no gap at all', () => {
    expect(careerStartLine([gap('Kubernetes', 'low')], 'Timeline not specified')).toBe(
      'Start with Kubernetes: it is the one skill gap this move names.',
    )
    expect(careerStartLine([], '0-3 months')).toBeNull()
  })

  it('renders as "Where to start" after the gaps, and no "Note" section', () => {
    const payload = {
      recommended_direction: { role_title: 'Staff Engineer', fit_score: 80, transition_timeline: '0-3 months', confidence: 'high' },
      skill_gaps: [{ skill: 'Cloud Architecture', urgency: 'high' }],
    }
    render(<>{resultDefinitions.career.render(payload, makeItem('career', payload), tools.career)}</>)
    expect(screen.getByRole('heading', { name: 'Where to start' })).toBeTruthy()
    expect(screen.queryByRole('heading', { name: 'Note' })).toBeNull()
    expect(screen.getByText(/Start with Cloud Architecture/)).toBeTruthy()
  })
})

// Sign-off tool-results-F57: one rule for counted headings. Every report section whose content is a list or a table of
// N items says N in its count pill (the roadmap's "3-step" title already carries its number).
describe('counted section headings', () => {
  const runs: Array<[keyof typeof resultDefinitions, Record<string, unknown>]> = [
    [
      'job-match',
      {
        match_score: 60,
        requirements: [{ requirement: 'Python', status: 'matched' }, { requirement: 'Go', status: 'missing' }],
        top_actions: [],
        tailoring_actions: [{ keyword: 'Go', action: 'Name the Go service.' }],
        interview_focus: ['Talk about on-call.'],
      },
    ],
    ['cover-letter', { opening: { text: 'Hi.' }, body_points: [{ text: 'Body.' }], closing: { text: 'Bye.' }, customization_notes: [{ category: 'tone', note: 'Warmer.' }] }],
    [
      'interview',
      {
        questions: [{ question: 'Q?', answer: 'A.' }],
        focus_areas: [{ title: 'APIs' }, { title: 'Teams' }],
        weak_signals_to_prepare: [{ title: 'Scale' }],
        interviewer_notes: ['Ask about scope.'],
      },
    ],
    [
      'career',
      {
        recommended_direction: { role_title: 'Staff Engineer', fit_score: 70 },
        paths: [{ role_title: 'Staff Engineer', fit_score: 70 }, { role_title: 'Manager', fit_score: 60 }],
        skill_gaps: [{ skill: 'Strategy', urgency: 'high' }],
        next_steps: [{ timeframe: 'Month 1', action: 'Do it.' }],
      },
    ],
    ['portfolio', { projects: [{ project_title: 'P1', deliverables: ['Repo', 'Write-up'] }], sequence_plan: [{ order: 1 }], presentation_tips: ['Lead with the outcome.'] }],
  ]

  it.each(runs)('%s: every list or table section carries its count', (tool, payload) => {
    const { container, unmount } = render(<>{resultDefinitions[tool].render(payload, makeItem(tool, payload), tools[tool])}</>)
    const listed = Array.from(container.querySelectorAll<HTMLElement>('section[data-toc-title]')).filter(
      (section) => section.querySelector('.kit-list, table, ol') && !/\d/.test(section.dataset.tocTitle ?? ''),
    )
    expect(listed.length).toBeGreaterThan(0)
    const uncounted = listed.filter((section) => !section.querySelector('.kit-section__count')).map((s) => s.dataset.tocTitle)
    expect(uncounted).toEqual([])
    unmount()
  })

  // Sign-off tool-results-F69: "Save to your profile", appended under the report, lists the run's claims too, so it
  // follows the same rule (it sat uncounted under "Interviewer notes (2)").
  it.each([
    ['cover-letter', { body_points: [{ text: 'Shipped the billing rewrite.' }, { text: 'Cut deploy time in half.' }] }, 2],
    ['interview', { questions: [{ question: 'Q1?', answer: 'A1.' }, { question: 'Q2?', answer: 'A2.' }, { question: 'Q3?', answer: 'A3.' }] }, 3],
  ] as const)('%s: "Save to your profile" carries the count of its claims', (tool, payload, n) => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } })
    client.setQueryData(EVIDENCE_QUERY_KEY, [])
    const { container } = render(
      <QueryClientProvider client={client}>
        <ClaimPromotionSection toolId={tool} payload={payload} authenticated />
      </QueryClientProvider>,
    )
    const section = container.querySelector('section')
    expect(section?.querySelectorAll('.kit-list .kit-row')).toHaveLength(n)
    expect(section?.querySelector('.kit-section__count')?.textContent).toBe(String(n))
  })
})

describe('FixFirstList', () => {
  const actions = [
    { title: 'A', action: 'do a', priority: 'high' },
    { title: 'B', action: 'do b', priority: 'medium' },
  ]

  it('renders the actions as numbered stickers under a heading with a count', () => {
    const { container } = render(<FixFirstList actions={actions} />)
    expect(screen.getByRole('heading', { name: /^Fix first/ }).textContent).toContain('2')
    expect(container.querySelectorAll('ol > li.kit-sticker').length).toBe(2)
    expect(screen.getByRole('heading', { level: 3, name: 'A' })).toBeTruthy()
  })

  it('shows the third action as a row under the two stickers, numbered 3', () => {
    const three = [...actions, { title: 'C', action: 'do c', priority: 'low' }]
    const { container } = render(<FixFirstList actions={three} />)
    expect(container.querySelectorAll('li.kit-sticker').length).toBe(2)
    const more = screen.getByRole('list', { name: 'More to fix' })
    expect(more.textContent).toContain('C')
    // The List is a size container, which scopes a counter-reset on it; each row sets its own number instead.
    expect((more as HTMLElement).style.counterReset).toBe('')
    const rows = Array.from(more.querySelectorAll<HTMLElement>(':scope > .kit-row'))
    expect(rows.map((row) => row.style.counterSet)).toEqual(['kit-row 3'])
    // On a phone its severity badge drops under the text (kit RowMeta below), so the title keeps the full width.
    expect(rows[0].querySelector('.kit-row__meta')?.getAttribute('data-placement')).toBe('below')
  })

  it('renders nothing without actions', () => {
    const { container } = render(<FixFirstList actions={[]} />)
    expect(container.firstChild).toBeNull()
  })

  it('shows severity as text, derived from priority and not position', () => {
    render(
      <FixFirstList
        actions={[
          { title: 'Low first', action: 'x', priority: 'low' },
          { title: 'High second', action: 'y', priority: 'high' },
        ]}
      />,
    )
    expect(screen.getByText('Low')).toBeTruthy()
    expect(screen.getByText('High')).toBeTruthy()
  })

  it('caps the list at three items', () => {
    const many = Array.from({ length: 5 }, (_, i) => ({ title: `T${i}`, action: 'x', priority: 'medium' }))
    const { container } = render(<FixFirstList actions={many} />)
    expect(container.querySelectorAll('ol > li').length).toBe(3)
  })

  it('slaps the stickers on only while the reveal plays', () => {
    const { container } = render(<FixFirstList actions={actions} />)
    expect(container.querySelector('[data-reveal="slap"]')).toBeNull()
  })
})

describe('result summary', () => {
  it('reads the score and facts for a resume', () => {
    const summary = resultDefinitions.resume.summary({
      overall_score: 77,
      summary: { verdict: 'Strong foundation', confidence_note: 'Directional.' },
      issues: [{ id: 'a', title: 'x' }],
      role_fit: { target_role_label: 'Engineer', fit_score: 64, rationale: 'r' },
    })
    expect(summary.score).toEqual({ value: 77, label: 'Resume score', unit: '/100' })
    expect(summary.facts.map((f) => f.label)).toEqual(['Verdict', 'Issues'])
    expect(summary.note).toBe('Directional.')
  })

  it('puts requirements met under the job match score as a bar, not as a fact', () => {
    const summary = resultDefinitions['job-match'].summary({
      match_score: 70,
      verdict: 'borderline',
      requirements: [
        { requirement: 'A', status: 'matched' },
        { requirement: 'B', status: 'missing' },
      ],
      matched_keywords: ['A'],
      missing_keywords: ['B'],
    })
    expect(summary.bars).toEqual([{ label: 'Requirements met', value: 1, max: 2, valueLabel: '1 of 2' }])
    expect(summary.facts.map((f) => f.label)).toEqual(['Verdict', 'Keywords found', 'Keywords missing'])
  })

  // Sign-off tool-results-F53: a missing score is not a zero. The seal draws its "not available" state (STICKER 5.9),
  // the verdict colour comes from the words alone, and the copied text says so instead of "0/100".
  it('passes a missing resume or match score through as null, never as 0', () => {
    const resume = { overall_score: null, summary: { verdict: 'Advisory review' } }
    const summary = resultDefinitions.resume.summary(resume)
    expect(summary.score).toEqual({ value: null, label: 'Resume score', unit: '/100' })
    expect(summary.verdict).toEqual({ label: 'Advisory review', tone: 'lemon' })
    expect(resultDefinitions.resume.summary({ overall_score: null, summary: { verdict: 'Reviewed' } }).verdict?.tone).toBe('white')
    const item = makeItem('resume', resume)
    expect(resultDefinitions.resume.copyText(resume, item)).toContain('Resume score: not available')
    expect(resultDefinitions.resume.copyText(resume, item)).not.toContain('0/100')

    const match = { match_score: null, verdict: 'borderline' }
    expect(resultDefinitions['job-match'].summary(match).score?.value).toBeNull()
    expect(resultDefinitions['job-match'].copyText(match, makeItem('job-match', match))).toContain('Match score: not available')
    // A real zero is still a score.
    expect(resultDefinitions.resume.summary({ overall_score: 0 }).score?.value).toBe(0)
  })

  it('has no score for generative tools', () => {
    expect(resultDefinitions['cover-letter'].summary({}).score).toBeUndefined()
    expect(resultDefinitions.interview.summary({}).score).toBeUndefined()
    expect(resultDefinitions.portfolio.summary({}).score).toBeUndefined()
  })
})

describe('label helpers', () => {
  it('counts nouns in the singular and the plural', () => {
    expect(countOf(1, 'question')).toBe('1 question')
    expect(countOf(0, 'project')).toBe('0 projects')
    expect(countOf(6, 'word')).toBe('6 words')
  })

  it('keeps a long role label whole', () => {
    const long = 'Staff Software Engineer, Data Infrastructure and Developer Productivity (Berlin or remote)'
    expect(roleFitLabel(long)).toBe(`Target role: ${long}`)
  })

  it('prefixes role labels without doubling the placeholder', () => {
    expect(roleFitLabel('the target role')).toBe('Target role')
    expect(roleFitLabel('Backend Engineer')).toBe('Target role: Backend Engineer')
  })

  it('does not repeat what Fix first already says, and does not badge every row the same', () => {
    const payload = {
      summary: { headline: 'h' },
      top_actions: [{ title: 'Close Kubernetes', action: 'Add a bullet for Kubernetes.', priority: 'high' }],
      match_score: 60,
      requirements: [{ requirement: 'Kubernetes', importance: 'must', status: 'missing', resume_evidence: '', suggested_fix: 'Add a bullet for Kubernetes.' }],
      tailoring_actions: [
        { section: 'experience', keyword: 'Kubernetes', action: 'Add a bullet for Kubernetes.' },
        { section: 'skills', keyword: 'Terraform', action: 'List Terraform under skills.' },
      ],
      interview_focus: ['Kubernetes', 'System design'],
    }
    render(resultDefinitions['job-match'].render(payload, makeItem('job-match', payload), tools['job-match']))
    const tailoring = screen.getByRole('list', { name: 'Tailoring actions' })
    expect(tailoring.textContent).toContain('Terraform')
    expect(tailoring.textContent).not.toContain('Kubernetes')
    const prep = screen.getByRole('list', { name: 'Interview prep' })
    expect(prep.textContent).toContain('System design')
    expect(prep.textContent).not.toContain('Kubernetes')
  })

  it('shows Practice first and severity badges only when they tell rows apart', () => {
    const question = (n: number, practice: boolean) => ({ question: `Q${n}?`, answer: 'A.', focus_area: 'Area', practice_first: practice })
    const same = {
      summary: { headline: 'h' },
      questions: [question(1, true), question(2, true)],
      weak_signals_to_prepare: [{ title: 'W1', severity: 'high' }, { title: 'W2', severity: 'high' }],
    }
    const { unmount } = render(resultDefinitions.interview.render(same, makeItem('interview', same), tools.interview))
    expect(screen.queryByText('Practice first')).toBeNull()
    expect(screen.queryByText('High')).toBeNull()
    unmount()

    const mixed = {
      summary: { headline: 'h' },
      questions: [question(1, true), question(2, false)],
      weak_signals_to_prepare: [{ title: 'W1', severity: 'high' }, { title: 'W2', severity: 'low' }],
    }
    render(resultDefinitions.interview.render(mixed, makeItem('interview', mixed), tools.interview))
    expect(screen.getAllByText('Practice first')).toHaveLength(1)
    expect(screen.getByText('High')).toBeTruthy()
    expect(screen.getByText('Low')).toBeTruthy()
  })

  it('keeps rows with the same requirement text apart', () => {
    const requirement = { requirement: 'Python', importance: 'must', status: 'matched', resume_evidence: 'Yes.', suggested_fix: '' }
    const payload = { summary: { headline: 'h' }, match_score: 80, requirements: [requirement, requirement] }
    render(resultDefinitions['job-match'].render(payload, makeItem('job-match', payload), tools['job-match']))
    expect(screen.getAllByText('Python')).toHaveLength(2)
  })
})

describe('score breakdown helpers', () => {
  const rows = [
    { label: 'Keyword alignment', score: 75 },
    { label: 'Impact evidence', score: 78 },
    { label: 'Structure', score: 82 },
    { label: 'Clarity', score: 76 },
    { label: 'Completeness', score: 74 },
  ]

  it('highlights the two lowest dimensions, ties by list order, and nothing for fewer than three', () => {
    const low = lowestTwo(rows)
    expect([...low].map((r) => r.label)).toEqual(['Completeness', 'Keyword alignment'])
    expect(lowestTwo(rows.slice(0, 2)).size).toBe(0)
    const tied = lowestTwo([{ label: 'A', score: 50 }, { label: 'B', score: 50 }, { label: 'C', score: 50 }])
    expect([...tied].map((r) => r.label)).toEqual(['A', 'B'])
  })

  it('reads the note from the numbers', () => {
    expect(breakdownInsight(rows)).toBe(
      'Structure is your strongest area at 82. Completeness is the lowest at 74, with keyword alignment close behind at 75.',
    )
    expect(breakdownInsight([{ label: 'A', score: 90 }, { label: 'B', score: 60 }, { label: 'C', score: 40 }])).toContain('then b at 60')
    expect(breakdownInsight([{ label: 'A', score: 60 }, { label: 'B', score: 60 }])).toBe('Every area scores 60.')
    expect(breakdownInsight([{ label: 'A', score: 60 }])).toBe('')
  })

  it('draws the lowest two bars in the highlight tone and the rest in ink', () => {
    const payload = {
      summary: { headline: 'h' },
      overall_score: 77,
      score_breakdown: rows.map((r, i) => ({ key: ['keywords', 'impact', 'structure', 'clarity', 'completeness'][i], label: r.label, score: r.score })),
    }
    const { container } = render(resultDefinitions.resume.render(payload, makeItem('resume', payload), tools.resume))
    const tones = [...container.querySelectorAll('.kit-score__fill')].map((el) => el.getAttribute('data-tone'))
    expect(tones).toEqual(['accent', 'ink', 'ink', 'ink', 'accent'])
    expect(screen.getByText('Lowest two')).toBeTruthy()
  })
})

describe('job match missing keywords', () => {
  it('opens a missing keyword to its guidance and the only-if-true note', () => {
    const payload = {
      summary: { headline: 'h' },
      match_score: 60,
      missing_keywords: [{ keyword: 'Kubernetes', contextual_guidance: 'Mention the cluster you ran.', anti_stuffing_note: 'Do not list it without using it.' }],
    }
    render(resultDefinitions['job-match'].render(payload, makeItem('job-match', payload), tools['job-match']))
    fireEvent.click(screen.getByRole('button', { name: 'Kubernetes' }))
    expect(screen.getByText('Mention the cluster you ran.')).toBeTruthy()
    expect(screen.getByText(/Do not list it without using it/)).toBeTruthy()
    expect(screen.getByText('Only if true.')).toBeTruthy()
  })
})

describe('cover letter sheet', () => {
  const payload = {
    opening: { text: 'Dear team,', why_this_paragraph: 'Hooks with the role.', requirements_used: ['Python'] },
    body_points: [{ text: 'Body.', why_this_paragraph: 'Proves the stack.', requirements_used: ['Kubernetes', 'SQL'] }],
    closing: { text: 'Thanks.', why_this_paragraph: 'Asks for a call.', requirements_used: [] },
    generated_at: '2026-03-13T10:00:00Z',
  }

  it('numbers the sections and shows each one its own rationale and requirements', () => {
    const item = makeItem('cover-letter', payload)
    render(<>{resultDefinitions['cover-letter'].render(payload, item, tools['cover-letter'])}</>)
    expect(screen.getByText('Hooks with the role.')).toBeTruthy()
    expect(screen.getByText('Proves the stack.')).toBeTruthy()
    expect(screen.getByText('Asks for a call.')).toBeTruthy()
    expect(screen.getAllByRole('list', { name: 'Requirements it answers' })).toHaveLength(2)
    expect(screen.getByText('Kubernetes')).toBeTruthy()
  })

  it('offers the edited letter as Markdown under a slugged file name', () => {
    const item = { ...makeItem('cover-letter', payload), label: 'Backend / Lumen: letter?' }
    const definition = resultDefinitions['cover-letter']
    render(<>{definition.render(payload, item, tools['cover-letter'])}</>)
    fireEvent.change(screen.getByLabelText('Opening paragraph'), { target: { value: 'Edited opening.' } })
    const md = definition.download?.(payload, item, 'md')
    expect(md?.filename).toBe('backend-lumen-letter.md')
    expect(md?.content).toContain('Edited opening.')
    expect(definition.download?.(payload, item, 'txt')?.filename).toBe('backend-lumen-letter.txt')
  })

  it('keeps an edit in this tab (never in localStorage) and shows it after a reload', async () => {
    const store = new Map<string, string>()
    vi.stubGlobal('sessionStorage', {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => store.set(k, v),
      removeItem: (k: string) => store.delete(k),
    })
    const localSet = vi.spyOn(Storage.prototype, 'setItem')
    vi.useFakeTimers()
    const item = { ...makeItem('cover-letter', payload), id: 'cover-letter-demo-1', saved: false }
    const definition = resultDefinitions['cover-letter']
    const first = render(<>{definition.render(payload, item, tools['cover-letter'])}</>)
    fireEvent.change(screen.getByLabelText('Opening paragraph'), { target: { value: 'My own opening.' } })
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1200)
    })
    expect(screen.getByText('Saved in this tab')).toBeTruthy()
    expect(screen.getByText(/the PDF still has the original letter/)).toBeTruthy()
    expect(store.has('cw:letter-edit:cover-letter-demo-1')).toBe(true)
    expect(localSet).not.toHaveBeenCalled()
    localSet.mockRestore()
    first.unmount()
    vi.useRealTimers()

    render(<>{definition.render(payload, item, tools['cover-letter'])}</>)
    expect((screen.getByLabelText('Opening paragraph') as HTMLTextAreaElement).value).toBe('My own opening.')
    vi.unstubAllGlobals()
  })
})

describe('sign-off r2 wording and tones', () => {
  // A 74 read "High match" over a rationale saying it was not yet a strong match: the FitStamp bands decide.
  it('words the role fit on the app fit bands', () => {
    expect(roleFitLevel(86).label).toBe('Strong match')
    expect(roleFitLevel(80).label).toBe('Strong match')
    expect(roleFitLevel(74).label).toBe('Good match')
    expect(roleFitLevel(65).label).toBe('Good match')
    expect(roleFitLevel(64).label).toBe('Stretch')
  })

  // The career verdict sticker is toned by confidence: its words now say the confidence, in one short line.
  it('says the career confidence on the sticker that is coloured by it', () => {
    expect(careerVerdict('Best next move identified', 'medium', 76)).toEqual({ label: 'Medium confidence', tone: 'lemon' })
    expect(careerVerdict('Best next move identified', 'high', 88)).toEqual({ label: 'High confidence', tone: 'mint' })
    expect(careerVerdict('Strong fit', '', 88)).toEqual({ label: 'Strong fit', tone: 'mint' })
  })

  it('puts an alternative path rationale under its role, not in a narrow last column', () => {
    const payload = {
      summary: { headline: 'h', verdict: 'v', confidence_note: '' },
      recommended_direction: { role_title: 'Staff Engineer', fit_score: 76, transition_timeline: '6 months', confidence: 'medium' },
      paths: [
        { role_title: 'Staff Engineer', fit_score: 76, transition_timeline: '6 months', risk_level: 'medium', rationale: 'Main.' },
        { role_title: 'Platform Engineer', fit_score: 70, transition_timeline: '3-6 months', risk_level: 'low', rationale: 'Builds on the infra work you already lead.' },
        { role_title: 'Engineering Manager', fit_score: 60, transition_timeline: '12 months', risk_level: 'high', rationale: 'People leadership is thin so far.' },
      ],
    }
    render(resultDefinitions.career.render(payload, makeItem('career', payload), tools.career))
    expect(screen.queryByRole('columnheader', { name: 'Rationale' })).toBeNull()
    const row = screen.getByRole('rowheader', { name: /Platform Engineer/ })
    expect(row.textContent).toContain('Builds on the infra work you already lead.')
  })

  it('counts questions and projects with the numeric pill, like every other section', () => {
    const interview = {
      summary: { headline: 'h', verdict: 'v', confidence_note: '' },
      questions: [
        { question: 'Tell me about a migration.', focus_area: 'Delivery' },
        { question: 'How do you debug latency?', focus_area: 'Observability' },
      ],
    }
    const { unmount } = render(resultDefinitions.interview.render(interview, makeItem('interview', interview), tools.interview))
    const section = screen.getByRole('heading', { name: /Question breakdown/ }).closest('section') as HTMLElement
    expect(section.querySelector('.kit-section__count')?.textContent).toBe('2')
    unmount()
  })

  it('gives project complexity no hue: "Start here" is the one coloured badge on a card', () => {
    const payload = {
      summary: { headline: 'h', verdict: 'v', confidence_note: '' },
      projects: [
        { project_title: 'Intake Service', complexity: 'foundational', hiring_signals: ['Operational clarity under load'] },
        { project_title: 'Event Pipeline', complexity: 'advanced' },
      ],
      recommended_start_project: 'Intake Service',
    }
    render(resultDefinitions.portfolio.render(payload, makeItem('portfolio', payload), tools.portfolio))
    for (const label of ['Foundational', 'Advanced']) {
      expect(screen.getByText(label).closest('.kit-badge')?.getAttribute('data-tone')).toBe('info')
    }
    expect(screen.getByText('Operational clarity under load').closest('.kit-badge')?.getAttribute('data-wrap')).toBe('true')
    const section = screen.getByRole('heading', { name: /The build sequence/ }).closest('section') as HTMLElement
    expect(section.querySelector('.kit-section__count')?.textContent).toBe('2')
  })
})

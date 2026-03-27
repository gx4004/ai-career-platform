import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { resultDefinitions } from '#/lib/tools/resultDefinitions'
import { tools } from '#/lib/tools/registry'
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

    expect(screen.getByText(/Fix first/i)).toBeTruthy()
    expect(screen.getByText(/Score breakdown/i)).toBeTruthy()
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

    expect(screen.getByText(/Requirements/i)).toBeTruthy()
    expect(screen.getByText(/Keyword coverage/i)).toBeTruthy()
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

    expect(screen.getByText(/Gaps first/i)).toBeTruthy()
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
    expect(screen.getByText(/Path comparison/i)).toBeTruthy()
    expect(screen.getByText(/Skill gaps/i)).toBeTruthy()
    expect(screen.getByText(/Roadmap/i)).toBeTruthy()
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

    expect(screen.getByText(/Project roadmap/i)).toBeTruthy()
    expect(screen.getByText(/Presentation tips/i)).toBeTruthy()
    expect(screen.getAllByText(/Operational Intake Service/i).length).toBeGreaterThan(0)
    expect(screen.getByText(/Strategy/i)).toBeTruthy()
  })
})

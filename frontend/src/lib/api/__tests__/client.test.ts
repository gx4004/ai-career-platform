import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

vi.mock('#/lib/auth/storage', () => ({
  getAuthToken: vi.fn(() => null),
  clearAuthToken: vi.fn(),
  setAuthToken: vi.fn(),
}))

import {
  login,
  register,
  getCurrentUser,
  getHealth,
  getHistory,
  getHistoryItem,
  deleteHistoryItem,
  setHistoryFavorite,
  parseCv,
  importJobUrl,
  runResumeAnalysis,
  runJobMatch,
  runCoverLetter,
  runInterview,
  runCareer,
  runPortfolio,
  API_URL,
} from '#/lib/api/client'
import { getAuthToken, clearAuthToken } from '#/lib/auth/storage'

const mockFetch = vi.fn()
globalThis.fetch = mockFetch

function mockJsonResponse(data: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    clone() {
      return this
    },
    json: () => Promise.resolve(data),
    text: () => Promise.resolve(JSON.stringify(data)),
  }
}

beforeEach(() => {
  vi.clearAllMocks()
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('API client', () => {
  describe('login', () => {
    it('sends POST to /auth/login and returns token', async () => {
      const tokenData = { access_token: 'test-token', token_type: 'bearer' }
      mockFetch.mockResolvedValueOnce(mockJsonResponse(tokenData))

      const result = await login({ email: 'test@example.com', password: 'pass123' })

      expect(mockFetch).toHaveBeenCalledOnce()
      const [url, options] = mockFetch.mock.calls[0]
      expect(url).toBe(`${API_URL}/auth/login`)
      expect(options.method).toBe('POST')
      expect(result.access_token).toBe('test-token')
    })
  })

  describe('register', () => {
    it('sends POST to /auth/register and returns user', async () => {
      const userData = { id: '1', email: 'test@example.com', is_active: true }
      mockFetch.mockResolvedValueOnce(mockJsonResponse(userData))

      const result = await register({ email: 'test@example.com', password: 'pass123' })

      const [url] = mockFetch.mock.calls[0]
      expect(url).toBe(`${API_URL}/auth/register`)
      expect(result.id).toBe('1')
    })
  })

  describe('getCurrentUser', () => {
    it('sends GET to /auth/me', async () => {
      const userData = { id: '1', email: 'test@example.com', is_active: true }
      mockFetch.mockResolvedValueOnce(mockJsonResponse(userData))

      const result = await getCurrentUser()

      const [url, options] = mockFetch.mock.calls[0]
      expect(url).toBe(`${API_URL}/auth/me`)
      expect(options.method).toBe('GET')
      expect(result.email).toBe('test@example.com')
    })
  })

  describe('getHealth', () => {
    it('sends GET to /health', async () => {
      const healthData = { status: 'ok' }
      mockFetch.mockResolvedValueOnce(mockJsonResponse(healthData))

      const result = await getHealth()

      expect(result.status).toBe('ok')
    })
  })

  describe('error handling', () => {
    it('throws on non-ok response', async () => {
      mockFetch.mockResolvedValueOnce(
        mockJsonResponse({ detail: 'Not found' }, 404),
      )

      await expect(getHealth()).rejects.toThrow('Not found')
    })

    it('clears auth token on 401', async () => {
      mockFetch.mockResolvedValueOnce(
        mockJsonResponse({ detail: 'Unauthorized' }, 401),
      )

      await expect(getCurrentUser()).rejects.toThrow()
      expect(clearAuthToken).toHaveBeenCalled()
    })
  })

  describe('auth header', () => {
    it('includes Authorization header when token exists', async () => {
      vi.mocked(getAuthToken).mockReturnValue('my-token')
      mockFetch.mockResolvedValueOnce(
        mockJsonResponse({ status: 'ok' }),
      )

      await getHealth()

      const [, options] = mockFetch.mock.calls[0]
      const headers = options.headers as Headers
      expect(headers.get('Authorization')).toBe('Bearer my-token')
    })
  })

  describe('tool endpoints', () => {
    it('runResumeAnalysis sends to /resume/analyze', async () => {
      mockFetch.mockResolvedValueOnce(mockJsonResponse({
        history_id: 'r1',
        schema_version: 'quality_v2',
        summary: {
          headline: 'Promising resume with clear next edits.',
          verdict: 'Promising but uneven',
          confidence_note: 'Directional heuristic only.',
        },
        top_actions: [],
        generated_at: '2026-03-13T10:00:00Z',
        download_title: 'Resume revision kit',
        exportable_sections: [],
        editable_blocks: [],
        overall_score: 84,
        score_breakdown: [
          { key: 'keywords', label: 'Keyword alignment', score: 80 },
          { key: 'impact', label: 'Impact evidence', score: 78 },
          { key: 'structure', label: 'Structure', score: 86 },
          { key: 'clarity', label: 'Clarity', score: 84 },
          { key: 'completeness', label: 'Completeness', score: 92 },
        ],
        strengths: [],
        issues: [],
        evidence: {
          detected_sections: [],
          detected_skills: [],
          matched_keywords: [],
          missing_keywords: [],
          quantified_bullets: 0,
        },
        role_fit: null,
      }))

      await runResumeAnalysis({ resume_text: 'my resume' })

      const [url, options] = mockFetch.mock.calls[0]
      expect(url).toBe(`${API_URL}/resume/analyze`)
      expect(options.method).toBe('POST')
    })

    it('runJobMatch sends to /job-match/match', async () => {
      mockFetch.mockResolvedValueOnce(mockJsonResponse({
        history_id: 'j1',
        schema_version: 'quality_v2',
        summary: {
          headline: 'Strong baseline with a few gaps to close.',
          verdict: 'borderline',
          confidence_note: 'Directional heuristic only.',
        },
        top_actions: [],
        generated_at: '2026-03-13T10:00:00Z',
        download_title: 'Job match application brief',
        exportable_sections: [],
        editable_blocks: [],
        match_score: 91,
        verdict: 'strong',
        requirements: [],
        matched_keywords: [],
        missing_keywords: [],
        tailoring_actions: [],
        interview_focus: [],
        recruiter_summary: '',
      }))

      await runJobMatch({ resume_text: 'resume', job_description: 'job' })

      const [url] = mockFetch.mock.calls[0]
      expect(url).toBe(`${API_URL}/job-match/match`)
    })

    it('runCoverLetter sends to /cover-letter/generate', async () => {
      mockFetch.mockResolvedValueOnce(mockJsonResponse({
        history_id: 'c1',
        schema_version: 'quality_v2',
        summary: {
          headline: 'The draft is targeted and ready for a stronger evidence pass.',
          verdict: 'Application-ready draft',
          confidence_note: 'Advisory draft only.',
        },
        top_actions: [],
        generated_at: '2026-03-13T10:00:00Z',
        download_title: 'Cover letter draft',
        exportable_sections: [],
        editable_blocks: [],
        opening: {
          text: 'Dear Hiring Manager, I am excited to apply.',
          why_this_paragraph: 'Connect fit quickly.',
          requirements_used: ['Python'],
          evidence_used: ['Built APIs for customer teams.'],
        },
        body_points: [],
        closing: {
          text: 'Thank you for your consideration.',
          why_this_paragraph: 'Close confidently.',
          requirements_used: ['Backend Engineer'],
          evidence_used: [],
        },
        full_text: 'Dear Hiring Manager...',
        tone_used: 'Professional',
        customization_notes: [],
      }))

      await runCoverLetter({ resume_text: 'resume', job_description: 'job' })

      const [url] = mockFetch.mock.calls[0]
      expect(url).toBe(`${API_URL}/cover-letter/generate`)
    })

    it('runInterview sends to /interview/questions', async () => {
      mockFetch.mockResolvedValueOnce(mockJsonResponse({
        history_id: 'i1',
        schema_version: 'quality_v2',
        summary: {
          headline: 'Start with the weak-signal topics first.',
          verdict: 'Gap-first practice plan',
          confidence_note: 'Advisory prep only.',
        },
        top_actions: [],
        generated_at: '2026-03-13T10:00:00Z',
        download_title: 'Interview practice packet',
        exportable_sections: [],
        editable_blocks: [],
        questions: [],
        focus_areas: [],
        weak_signals_to_prepare: [],
        interviewer_notes: [],
      }))

      await runInterview({ resume_text: 'resume', job_description: 'job' })

      const [url] = mockFetch.mock.calls[0]
      expect(url).toBe(`${API_URL}/interview/questions`)
    })

    it('runCareer sends to /career/recommend', async () => {
      mockFetch.mockResolvedValueOnce(mockJsonResponse({
        history_id: 'cr1',
        schema_version: 'planning_v1',
        summary: {
          headline: 'Recommended direction ready.',
          verdict: 'Promising path',
          confidence_note: 'Advisory planning output only.',
        },
        top_actions: [],
        generated_at: '2026-03-13T10:00:00Z',
        download_title: 'Career decision memo',
        exportable_sections: [],
        editable_blocks: [],
        recommended_direction: {
          role_title: 'Backend Engineer',
          fit_score: 78,
          transition_timeline: '3-6 months',
          why_now: 'You already have a strong technical base.',
          confidence: 'medium',
        },
        paths: [],
        current_skills: [],
        target_skills: [],
        skill_gaps: [],
        next_steps: [],
      }))

      await runCareer({ resume_text: 'resume' })

      const [url] = mockFetch.mock.calls[0]
      expect(url).toBe(`${API_URL}/career/recommend`)
    })

    it('runPortfolio sends to /portfolio/recommend', async () => {
      mockFetch.mockResolvedValueOnce(mockJsonResponse({
        history_id: 'p1',
        schema_version: 'planning_v1',
        summary: {
          headline: 'Portfolio roadmap ready.',
          verdict: 'Proof-building plan',
          confidence_note: 'Advisory planning output only.',
        },
        top_actions: [],
        generated_at: '2026-03-13T10:00:00Z',
        download_title: 'Portfolio showcase plan',
        exportable_sections: [],
        editable_blocks: [],
        target_role: 'engineer',
        portfolio_strategy: {
          headline: 'Build proof around backend delivery.',
          focus: 'APIs and reliability',
          proof_goal: 'Show end-to-end implementation skill.',
        },
        projects: [],
        recommended_start_project: 'API reliability dashboard',
        sequence_plan: [],
        presentation_tips: [],
      }))

      await runPortfolio({ resume_text: 'resume', target_role: 'engineer' })

      const [url] = mockFetch.mock.calls[0]
      expect(url).toBe(`${API_URL}/portfolio/recommend`)
    })
  })

  describe('history', () => {
    it('getHistory builds query params', async () => {
      mockFetch.mockResolvedValueOnce(
        mockJsonResponse({ items: [], total: 0, page: 1, page_size: 12, has_more: false }),
      )

      await getHistory({ tool: 'resume', favorite: true, q: 'test', page: 2 })

      const [url] = mockFetch.mock.calls[0]
      expect(url).toContain('tool=resume')
      expect(url).toContain('favorite=true')
      expect(url).toContain('q=test')
      expect(url).toContain('page=2')
    })

    it('getHistoryItem fetches by id', async () => {
      mockFetch.mockResolvedValueOnce(
        mockJsonResponse({
          id: 'abc',
          tool_name: 'resume',
          is_favorite: false,
          created_at: '2024-01-01',
          result_payload: {},
        }),
      )

      const result = await getHistoryItem('abc')

      expect(result.id).toBe('abc')
    })

    it('deleteHistoryItem sends DELETE', async () => {
      mockFetch.mockResolvedValueOnce(mockJsonResponse({ deleted: 1 }))

      const result = await deleteHistoryItem('abc')

      const [, options] = mockFetch.mock.calls[0]
      expect(options.method).toBe('DELETE')
      expect(result.deleted).toBe(1)
    })

    it('setHistoryFavorite sends PATCH', async () => {
      mockFetch.mockResolvedValueOnce(
        mockJsonResponse({
          id: 'abc',
          tool_name: 'resume',
          is_favorite: true,
          created_at: '2024-01-01',
        }),
      )

      const result = await setHistoryFavorite('abc', true)

      const [, options] = mockFetch.mock.calls[0]
      expect(options.method).toBe('PATCH')
      expect(result.is_favorite).toBe(true)
    })
  })

  describe('parseCv', () => {
    it('sends FormData to /files/parse-cv', async () => {
      mockFetch.mockResolvedValueOnce(
        mockJsonResponse({ filename: 'cv.pdf', extracted_text: 'content', warnings: [] }),
      )

      const file = new File(['content'], 'cv.pdf', { type: 'application/pdf' })
      const result = await parseCv(file)

      const [url, options] = mockFetch.mock.calls[0]
      expect(url).toBe(`${API_URL}/files/parse-cv`)
      expect(options.body).toBeInstanceOf(FormData)
      expect(result.filename).toBe('cv.pdf')
    })
  })

  describe('importJobUrl', () => {
    it('sends URL to /job-posts/import-url', async () => {
      mockFetch.mockResolvedValueOnce(
        mockJsonResponse({ job_description: 'role description' }),
      )

      const result = await importJobUrl({ url: 'https://example.com/job' })

      const [url] = mockFetch.mock.calls[0]
      expect(url).toBe(`${API_URL}/job-posts/import-url`)
      expect(result.job_description).toBe('role description')
    })
  })
})

import { describe, it, expect, beforeEach } from 'vitest'
import type { ToolId } from '#/lib/tools/registry'
import {
  readToolDraft,
  writeToolDraft,
  clearToolDraft,
  clearAllToolDrafts,
  baseDraftState,
  getDraftKey,
  readWorkflowContext,
  writeWorkflowContext,
  type ToolDraftState,
} from '#/lib/tools/drafts'

beforeEach(() => {
  sessionStorage.clear()
})

describe('drafts', () => {
  describe('getDraftKey', () => {
    it('creates prefixed key', () => {
      expect(getDraftKey('resume')).toBe('career-workbench:draft:resume')
      expect(getDraftKey('job-match')).toBe('career-workbench:draft:job-match')
    })
  })

  describe('readToolDraft', () => {
    it('returns base state when nothing stored', () => {
      const draft = readToolDraft('resume')
      expect(draft).toEqual(baseDraftState)
    })

    it('merges defaults over base state', () => {
      const draft = readToolDraft('resume', { targetRole: 'Engineer' })
      expect(draft.targetRole).toBe('Engineer')
      expect(draft.resumeText).toBe('')
    })

    it('reads stored draft over defaults', () => {
      const stored: ToolDraftState = {
        ...baseDraftState,
        resumeText: 'My stored resume',
      }
      sessionStorage.setItem(getDraftKey('resume'), JSON.stringify(stored))

      const draft = readToolDraft('resume', { targetRole: 'fallback' })
      expect(draft.resumeText).toBe('My stored resume')
    })

    it('handles invalid JSON gracefully', () => {
      sessionStorage.setItem(getDraftKey('resume'), 'not-json')
      const draft = readToolDraft('resume')
      expect(draft).toEqual(baseDraftState)
    })
  })

  describe('writeToolDraft', () => {
    it('persists draft to session storage', () => {
      const draft: ToolDraftState = {
        ...baseDraftState,
        resumeText: 'test content',
      }
      writeToolDraft('resume', draft)

      const raw = sessionStorage.getItem(getDraftKey('resume'))
      expect(raw).toBeTruthy()
      expect(JSON.parse(raw!).resumeText).toBe('test content')
    })
  })

  describe('clearToolDraft', () => {
    it('removes draft from session storage', () => {
      writeToolDraft('resume', { ...baseDraftState, resumeText: 'data' })
      expect(sessionStorage.getItem(getDraftKey('resume'))).toBeTruthy()

      clearToolDraft('resume')
      expect(sessionStorage.getItem(getDraftKey('resume'))).toBeNull()
    })
  })

  describe('clearAllToolDrafts', () => {
    it('removes all stored drafts', () => {
      writeToolDraft('resume', { ...baseDraftState, resumeText: 'resume' })
      writeToolDraft('job-match', { ...baseDraftState, jobDescription: 'job' })

      clearAllToolDrafts()

      expect(sessionStorage.getItem(getDraftKey('resume'))).toBeNull()
      expect(sessionStorage.getItem(getDraftKey('job-match'))).toBeNull()
    })

    // Drift proof: the clearing path must follow the writing path, not a
    // hand-maintained id list. A seventh tool (or a renamed id) must not
    // silently keep its resume text after logout or account deletion.
    it('removes a draft stored under a tool id no clearing list knows about', () => {
      const unlistedToolId = 'future-tool' as unknown as ToolId
      writeToolDraft(unlistedToolId, {
        ...baseDraftState,
        resumeText: 'private resume',
      })
      expect(sessionStorage.getItem(getDraftKey(unlistedToolId))).toBeTruthy()

      clearAllToolDrafts()

      expect(sessionStorage.getItem(getDraftKey(unlistedToolId))).toBeNull()
    })

    it('leaves session keys outside the draft prefix untouched', () => {
      writeToolDraft('resume', { ...baseDraftState, resumeText: 'resume' })
      sessionStorage.setItem('career-workbench:workflow-context', '{"updatedAt":1}')
      sessionStorage.setItem('cw:guest-banner-dismissed', '1')

      clearAllToolDrafts()

      expect(sessionStorage.getItem(getDraftKey('resume'))).toBeNull()
      expect(sessionStorage.getItem('career-workbench:workflow-context')).toBe(
        '{"updatedAt":1}',
      )
      expect(sessionStorage.getItem('cw:guest-banner-dismissed')).toBe('1')
    })
  })

  describe('workflow context', () => {
    it('reads null when nothing stored', () => {
      expect(readWorkflowContext()).toBeNull()
    })

    it('writes and reads workflow context', () => {
      writeWorkflowContext({
        resumeText: 'resume data',
        resumePendingReview: true,
        jobDescription: 'job data',
        lastToolId: 'resume',
        updatedAt: Date.now(),
      })

      const ctx = readWorkflowContext()
      expect(ctx?.resumeText).toBe('resume data')
      expect(ctx?.resumePendingReview).toBe(true)
      expect(ctx?.lastToolId).toBe('resume')
    })

    it('merges workflow updates so handoff signals are preserved', () => {
      writeWorkflowContext({
        jobMatch: {
          history_id: 'j1',
          schema_version: 'quality_v2',
          summary: {
            headline: 'Match ready',
            verdict: 'borderline',
            confidence_note: 'Directional heuristic only.',
          },
          top_actions: [],
          generated_at: '2026-03-13T10:00:00Z',
          download_title: 'Job match application brief',
          exportable_sections: [],
          editable_blocks: [],
          access_mode: 'authenticated',
          saved: true,
          locked_actions: [],
          access_decision: {
            state: 'full',
            treatment: 'control',
            reason: 'policy_disabled',
            can_export: true,
            policy_version: 'control-v1',
          },
          match_score: 68,
          verdict: 'borderline',
          requirements: [],
          matched_keywords: ['Python'],
          missing_keywords: [
            {
              keyword: 'Kubernetes',
              contextual_guidance: 'Orchestration appears twice in the JD.',
              anti_stuffing_note: 'Only mention if you genuinely operated a cluster.',
            },
          ],
          tailoring_actions: [],
          interview_focus: ['Kubernetes'],
          recruiter_summary: 'Needs stronger infrastructure proof.',
        },
        updatedAt: Date.now(),
      })

      writeWorkflowContext({
        resumeText: 'latest resume',
        resumePendingReview: false,
        lastToolId: 'cover-letter',
        updatedAt: Date.now(),
      })

      const ctx = readWorkflowContext()
      expect(ctx?.resumeText).toBe('latest resume')
      expect(ctx?.jobMatch?.missing_keywords[0]?.keyword).toBe('Kubernetes')
      expect(ctx?.resumePendingReview).toBe(false)
      expect(ctx?.lastToolId).toBe('cover-letter')
    })
  })
})

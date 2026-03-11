import { describe, it, expect, beforeEach, vi } from 'vitest'
import {
  readToolDraft,
  writeToolDraft,
  clearToolDraft,
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

  describe('workflow context', () => {
    it('reads null when nothing stored', () => {
      expect(readWorkflowContext()).toBeNull()
    })

    it('writes and reads workflow context', () => {
      writeWorkflowContext({
        resumeText: 'resume data',
        jobDescription: 'job data',
        lastToolId: 'resume',
        updatedAt: Date.now(),
      })

      const ctx = readWorkflowContext()
      expect(ctx?.resumeText).toBe('resume data')
      expect(ctx?.lastToolId).toBe('resume')
    })
  })
})

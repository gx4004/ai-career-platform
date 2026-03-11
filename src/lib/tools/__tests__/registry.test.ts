import { describe, it, expect } from 'vitest'
import {
  tools,
  toolList,
  toolGroups,
  getToolByHistoryName,
  type ToolId,
} from '#/lib/tools/registry'

describe('Tool registry', () => {
  const expectedIds: ToolId[] = [
    'resume',
    'job-match',
    'cover-letter',
    'interview',
    'career',
    'portfolio',
  ]

  it('exports all 6 tools', () => {
    expect(Object.keys(tools)).toHaveLength(6)
    for (const id of expectedIds) {
      expect(tools[id]).toBeDefined()
    }
  })

  it('toolList is sorted by priority', () => {
    for (let i = 1; i < toolList.length; i++) {
      expect(toolList[i].priority).toBeGreaterThan(toolList[i - 1].priority)
    }
  })

  it('toolList contains all tools', () => {
    expect(toolList).toHaveLength(6)
  })

  describe('tool definitions', () => {
    for (const tool of toolList) {
      it(`${tool.id} has required fields`, () => {
        expect(tool.id).toBeTruthy()
        expect(tool.label).toBeTruthy()
        expect(tool.shortLabel).toBeTruthy()
        expect(tool.route).toMatch(/^\//)
        expect(tool.resultRoute).toMatch(/\$historyId/)
        expect(tool.icon).toBeDefined()
        expect(tool.accent).toBeTruthy()
        expect(tool.group).toMatch(/^(primary|application|planning)$/)
        expect(tool.summary).toBeTruthy()
        expect(tool.submitPath).toMatch(/^\//)
        expect(typeof tool.submit).toBe('function')
      })
    }
  })

  describe('toolGroups', () => {
    it('groups tools correctly', () => {
      expect(toolGroups.primary.map((t) => t.id)).toEqual(['resume', 'job-match'])
      expect(toolGroups.application.map((t) => t.id)).toEqual(['cover-letter', 'interview'])
      expect(toolGroups.planning.map((t) => t.id)).toEqual(['portfolio', 'career'])
    })

    it('all groups cover all tools', () => {
      const allGrouped = [
        ...toolGroups.primary,
        ...toolGroups.application,
        ...toolGroups.planning,
      ]
      expect(allGrouped).toHaveLength(6)
    })
  })

  describe('getToolByHistoryName', () => {
    it('finds tool by id', () => {
      expect(getToolByHistoryName('resume')?.id).toBe('resume')
      expect(getToolByHistoryName('job-match')?.id).toBe('job-match')
    })

    it('finds tool by label (case-insensitive)', () => {
      expect(getToolByHistoryName('Resume Analyzer')?.id).toBe('resume')
      expect(getToolByHistoryName('resume analyzer')?.id).toBe('resume')
    })

    it('finds tool by shortLabel (case-insensitive)', () => {
      expect(getToolByHistoryName('Resume')?.id).toBe('resume')
      expect(getToolByHistoryName('match')?.id).toBe('job-match')
      expect(getToolByHistoryName('Letter')?.id).toBe('cover-letter')
    })

    it('returns null for unknown tool', () => {
      expect(getToolByHistoryName('nonexistent')).toBeNull()
    })
  })

  describe('next actions', () => {
    it('each tool has at least one next action', () => {
      for (const tool of toolList) {
        expect(tool.nextActions.length).toBeGreaterThanOrEqual(1)
      }
    })

    it('next action references valid tool ids', () => {
      for (const tool of toolList) {
        for (const action of tool.nextActions) {
          expect(expectedIds).toContain(action.to)
        }
      }
    })

    it('next action seed types are valid', () => {
      const validSeeds = ['resume', 'job', 'resume+job', 'none']
      for (const tool of toolList) {
        for (const action of tool.nextActions) {
          expect(validSeeds).toContain(action.seed)
        }
      }
    })
  })
})

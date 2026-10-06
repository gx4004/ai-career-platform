import { describe, expect, it } from 'vitest'
import { baseDraftState } from '#/lib/tools/drafts'
import { toolList } from '#/lib/tools/registry'
import { validateWorkflowDraft, workflowConfigs } from '#/lib/tools/workflowConfigs'

describe('validateWorkflowDraft', () => {
  it.each(toolList.map((tool) => tool.id))('asks %s for a resume in words that fit the upload control', (toolId) => {
    const errors = validateWorkflowDraft(workflowConfigs[toolId], { ...baseDraftState })

    expect(errors.resumeText).toBe('Add your resume: upload a PDF or DOCX, or paste the text.')
  })

  it('keeps the minimum-length message for pasted text that is too short', () => {
    const errors = validateWorkflowDraft(workflowConfigs.resume, { ...baseDraftState, resumeText: 'Too short' })

    expect(errors.resumeText).toBe('Resume text must be at least 50 characters.')
  })
})

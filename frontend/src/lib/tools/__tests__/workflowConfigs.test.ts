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

  // Sign-off tool-inputs-F33: every required field says what to do, like the resume, instead of "<Label> is required."
  it.each(['job-match', 'cover-letter', 'interview'] as const)('asks %s for the job description with a next step', (toolId) => {
    const errors = validateWorkflowDraft(workflowConfigs[toolId], { ...baseDraftState })

    expect(errors.jobDescription).toBe('Paste the job description, or import it from the posting’s link.')
  })

  it('asks Portfolio Planner for the target role with an example', () => {
    const errors = validateWorkflowDraft(workflowConfigs.portfolio, { ...baseDraftState })

    expect(errors.targetRole).toBe('Add the role you are aiming for, e.g. Staff Backend Engineer.')
  })

  it.each(toolList.map((tool) => tool.id))('leaves no required field of %s on the generic message', (toolId) => {
    for (const field of workflowConfigs[toolId].fields) {
      if (field.required) expect(field.requiredMessage, `${toolId}.${field.name}`).toBeTruthy()
    }
  })
})

import type { ToolDraftState } from '#/lib/tools/drafts'
import type { ToolId } from '#/lib/tools/registry'

export type WorkflowChoice = {
  label: string
  value: string
  description?: string
}

export type WorkflowFieldConfig = {
  name: keyof ToolDraftState
  kind: 'textarea' | 'text' | 'number' | 'choice'
  label: string
  placeholder: string
  description?: string
  required?: boolean
  rows?: number
  min?: number
  max?: number
  choices?: WorkflowChoice[]
}

export type WorkflowConfig = {
  toolId: ToolId
  defaults: Partial<ToolDraftState>
  fields: WorkflowFieldConfig[]
  buildPayload: (draft: ToolDraftState) => Record<string, unknown>
}

const toneChoices: WorkflowChoice[] = [
  { label: 'Professional', value: 'Professional' },
  { label: 'Confident', value: 'Confident' },
  { label: 'Warm', value: 'Warm' },
]

export const workflowConfigs: Record<ToolId, WorkflowConfig> = {
  resume: {
    toolId: 'resume',
    defaults: {},
    fields: [
      {
        name: 'resumeText',
        kind: 'textarea',
        label: 'Resume text',
        placeholder: 'Paste the resume content here…',
        rows: 12,
        required: true,
      },
      {
        name: 'jobDescription',
        kind: 'textarea',
        label: 'Job description',
        placeholder: 'Optional: paste a target role for more specific feedback…',
        rows: 8,
      },
    ],
    buildPayload: (draft) => ({
      resume_text: draft.resumeText,
      job_description: draft.jobDescription || undefined,
    }),
  },
  'job-match': {
    toolId: 'job-match',
    defaults: {},
    fields: [
      {
        name: 'resumeText',
        kind: 'textarea',
        label: 'Resume text',
        placeholder: 'Paste the resume content here…',
        rows: 10,
        required: true,
      },
      {
        name: 'jobDescription',
        kind: 'textarea',
        label: 'Job description',
        placeholder: 'Paste the full posting here…',
        rows: 10,
        required: true,
      },
    ],
    buildPayload: (draft) => ({
      resume_text: draft.resumeText,
      job_description: draft.jobDescription,
    }),
  },
  'cover-letter': {
    toolId: 'cover-letter',
    defaults: {
      tone: 'Professional',
    },
    fields: [
      {
        name: 'resumeText',
        kind: 'textarea',
        label: 'Resume text',
        placeholder: 'Paste the resume content here…',
        rows: 10,
        required: true,
      },
      {
        name: 'jobDescription',
        kind: 'textarea',
        label: 'Job description',
        placeholder: 'Paste the target posting here…',
        rows: 10,
        required: true,
      },
      {
        name: 'tone',
        kind: 'choice',
        label: 'Tone',
        placeholder: '',
        choices: toneChoices,
      },
    ],
    buildPayload: (draft) => ({
      resume_text: draft.resumeText,
      job_description: draft.jobDescription,
      tone: draft.tone || undefined,
    }),
  },
  interview: {
    toolId: 'interview',
    defaults: {
      numQuestions: 6,
    },
    fields: [
      {
        name: 'resumeText',
        kind: 'textarea',
        label: 'Resume text',
        placeholder: 'Paste the resume content here…',
        rows: 10,
        required: true,
      },
      {
        name: 'jobDescription',
        kind: 'textarea',
        label: 'Job description',
        placeholder: 'Paste the target posting here…',
        rows: 10,
        required: true,
      },
      {
        name: 'numQuestions',
        kind: 'number',
        label: 'Number of questions',
        placeholder: '6',
        min: 3,
        max: 12,
        description: 'Between 3 and 12 questions.',
      },
    ],
    buildPayload: (draft) => ({
      resume_text: draft.resumeText,
      job_description: draft.jobDescription,
      num_questions: draft.numQuestions || undefined,
    }),
  },
  career: {
    toolId: 'career',
    defaults: {},
    fields: [
      {
        name: 'resumeText',
        kind: 'textarea',
        label: 'Resume text',
        placeholder: 'Paste the resume content here…',
        rows: 12,
        required: true,
      },
      {
        name: 'targetRole',
        kind: 'text',
        label: 'Target role',
        placeholder: 'e.g. Product Designer',
      },
    ],
    buildPayload: (draft) => ({
      resume_text: draft.resumeText,
      target_role: draft.targetRole || undefined,
    }),
  },
  portfolio: {
    toolId: 'portfolio',
    defaults: {},
    fields: [
      {
        name: 'resumeText',
        kind: 'textarea',
        label: 'Resume text',
        placeholder: 'Paste the resume content here…',
        rows: 12,
        required: true,
      },
      {
        name: 'targetRole',
        kind: 'text',
        label: 'Target role',
        placeholder: 'Enter the role you want to build toward…',
        required: true,
      },
    ],
    buildPayload: (draft) => ({
      resume_text: draft.resumeText,
      target_role: draft.targetRole,
    }),
  },
}

const RESUME_MAX_CHARS = 50_000
const JD_MAX_CHARS = 20_000
const RESUME_MIN_WORDS = 50

export function validateWorkflowDraft(
  config: WorkflowConfig,
  draft: ToolDraftState,
): Partial<Record<keyof ToolDraftState, string>> {
  const errors: Partial<Record<keyof ToolDraftState, string>> = {}

  for (const field of config.fields) {
    const value = draft[field.name]
    const text = typeof value === 'string' ? value.trim() : ''

    // Required field check
    if (field.required && !text) {
      errors[field.name] = `${field.label} is required.`
      continue
    }

    if (!text) continue

    // Hard character limits
    if (field.name === 'resumeText' && text.length > RESUME_MAX_CHARS) {
      errors[field.name] = `Resume text exceeds ${RESUME_MAX_CHARS.toLocaleString()} character limit.`
    } else if (field.name === 'jobDescription' && text.length > JD_MAX_CHARS) {
      errors[field.name] = `Job description exceeds ${JD_MAX_CHARS.toLocaleString()} character limit.`
    }

    // Minimum length for required textareas
    if (field.required && field.kind === 'textarea' && text.length < 50) {
      errors[field.name] = `${field.label} must be at least 50 characters.`
    }
  }

  if (config.toolId === 'interview') {
    if (draft.numQuestions < 3 || draft.numQuestions > 12) {
      errors.numQuestions = 'Choose between 3 and 12 questions.'
    }
  }

  return errors
}

/** Soft warnings shown onBlur — do not block submission */
export function getFieldWarning(
  fieldName: string,
  value: string,
): string | null {
  const text = value.trim()
  if (!text) return null

  if (fieldName === 'resumeText') {
    const wordCount = text.split(/\s+/).length
    if (wordCount < RESUME_MIN_WORDS) {
      return 'This resume seems too short — results may be limited.'
    }
  }

  if (fieldName === 'jobDescription') {
    if (/^https?:\/\/\S+$/.test(text)) {
      return 'Looks like a URL — paste the full job description text instead.'
    }
  }

  return null
}

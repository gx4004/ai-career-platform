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
  badge: string
  title: string
  description: string
  loadingText: string
  guidance: string[]
  illustrationTitle: string
  illustrationBody: string
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
    badge: 'Core flow',
    title: 'Analyze the resume before changing anything else.',
    description:
      'Start the workflow with a clean read on your current strengths, gaps, and next edits.',
    loadingText: 'Analyzing resume…',
    guidance: [
      'Paste your latest resume or upload a PDF/DOCX.',
      'Add a target role if you want more contextual recommendations.',
      'Use the top action items as the next editing pass.',
    ],
    illustrationTitle: 'Resume quality snapshot',
    illustrationBody:
      'Scores, extracted skills, and action priorities all flow forward into the rest of the suite.',
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
    badge: 'Core flow',
    title: 'Compare the resume against one concrete role.',
    description:
      'Measure fit against a posting and see which skills are already covered and which are still missing.',
    loadingText: 'Comparing against role…',
    guidance: [
      'Use the same resume text you plan to apply with.',
      'Paste the full job description, not just a summary.',
      'Follow the next-step cards into cover letter and interview prep.',
    ],
    illustrationTitle: 'Fit analysis',
    illustrationBody:
      'The result page highlights matched skills, missing skills, and the right follow-up actions.',
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
    badge: 'Application support',
    title: 'Generate a targeted cover letter from the same context.',
    description:
      'Use the current resume and job description to produce a clean first draft you can edit or export.',
    loadingText: 'Writing cover letter…',
    guidance: [
      'Keep the pasted role specific so the draft feels targeted.',
      'Pick a tone, then refine the generated text in a new run if needed.',
      'Use Job Match first when you want the strongest context.',
    ],
    illustrationTitle: 'Draft-ready output',
    illustrationBody:
      'The generated letter can be copied instantly or downloaded as plain text for later editing.',
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
    badge: 'Application support',
    title: 'Build a role-specific interview practice deck.',
    description:
      'Generate structured questions, answer guidance, and key talking points for one role.',
    loadingText: 'Generating interview questions…',
    guidance: [
      'Use the same role context as your cover letter and job match.',
      'Set the question count based on how deep you want to practice.',
      'Practice mode hides answers until you reveal them.',
    ],
    illustrationTitle: 'Practice stack',
    illustrationBody:
      'Question cards can be reviewed in full or switched into a one-by-one practice flow.',
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
    badge: 'Planning',
    title: 'Compare realistic next directions and the gaps to close.',
    description:
      'Use your current resume to evaluate adjacent roles, timelines, and capability gaps.',
    loadingText: 'Exploring career paths…',
    guidance: [
      'The target role is optional, but it sharpens the recommendations.',
      'Use this after you understand your current resume profile.',
      'Move from the strongest path into Portfolio Planner next.',
    ],
    illustrationTitle: 'Transition map',
    illustrationBody:
      'The output compares possible paths, fit scores, timelines, and required capabilities.',
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
        placeholder: 'Optional: e.g. Product Designer, Frontend Engineer…',
      },
    ],
    buildPayload: (draft) => ({
      resume_text: draft.resumeText,
      target_role: draft.targetRole || undefined,
    }),
  },
  portfolio: {
    toolId: 'portfolio',
    badge: 'Planning',
    title: 'Turn the target role into concrete portfolio work.',
    description:
      'Plan projects that demonstrate the right skills for the role you want next.',
    loadingText: 'Planning portfolio projects…',
    guidance: [
      'Choose a role you want to move toward, not just the one you have now.',
      'Resume context keeps project ideas aligned with your current baseline.',
      'Use the complexity tags to choose the first project realistically.',
    ],
    illustrationTitle: 'Project roadmap',
    illustrationBody:
      'Recommendations focus on skills demonstrated, scope, and which project to start first.',
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

export function validateWorkflowDraft(
  config: WorkflowConfig,
  draft: ToolDraftState,
): Partial<Record<keyof ToolDraftState, string>> {
  const errors: Partial<Record<keyof ToolDraftState, string>> = {}

  for (const field of config.fields) {
    if (!field.required) continue

    const value = draft[field.name]
    if (typeof value === 'string' && !value.trim()) {
      errors[field.name] = `${field.label} is required.`
    } else if (field.kind === 'textarea' && typeof value === 'string' && value.trim().length < 50) {
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

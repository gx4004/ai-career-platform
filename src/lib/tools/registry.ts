import type { LucideIcon } from 'lucide-react'
import {
  BriefcaseBusiness,
  Compass,
  FileText,
  FolderKanban,
  MessagesSquare,
  ScanText,
} from 'lucide-react'
import {
  runCareer,
  runCoverLetter,
  runInterview,
  runJobMatch,
  runPortfolio,
  runResumeAnalysis,
} from '#/lib/api/client'

export type ToolId =
  | 'resume'
  | 'job-match'
  | 'cover-letter'
  | 'interview'
  | 'career'
  | 'portfolio'

export type WorkflowGroup = 'primary' | 'application' | 'planning'

export type ToolDefinition = {
  id: ToolId
  label: string
  shortLabel: string
  route: string
  resultRoute: string
  icon: LucideIcon
  accent: string
  group: WorkflowGroup
  priority: number
  summary: string
  entryPointLabel: string
  resultTitle: string
  emptyStateTitle: string
  emptyStateBody: string
  nextActions: Array<{
    label: string
    to: ToolId
    seed: 'resume' | 'job' | 'resume+job' | 'none'
  }>
  submitPath: string
  supportsCvUpload: boolean
  supportsJobImport: boolean
  authRequiredToRun: boolean
  submit: (payload: Record<string, unknown>) => Promise<Record<string, unknown>>
}

export const tools: Record<ToolId, ToolDefinition> = {
  resume: {
    id: 'resume',
    label: 'Resume Analyzer',
    shortLabel: 'Resume',
    route: '/resume',
    resultRoute: '/resume/result/$historyId',
    icon: ScanText,
    accent: 'var(--resume-accent)',
    group: 'primary',
    priority: 1,
    summary: 'Score your resume, identify strengths, and prioritize revisions.',
    entryPointLabel: 'Analyze resume',
    resultTitle: 'Resume analysis',
    emptyStateTitle: 'Analyze your current resume.',
    emptyStateBody: 'Start with your resume to seed the rest of the workflow.',
    nextActions: [
      { label: 'Compare it to a role', to: 'job-match', seed: 'resume' },
      { label: 'Plan your portfolio', to: 'portfolio', seed: 'resume' },
    ],
    submitPath: '/resume/analyze',
    supportsCvUpload: true,
    supportsJobImport: true,
    authRequiredToRun: false,
    submit: runResumeAnalysis as ToolDefinition['submit'],
  },
  'job-match': {
    id: 'job-match',
    label: 'Job Match',
    shortLabel: 'Match',
    route: '/job-match',
    resultRoute: '/job-match/result/$historyId',
    icon: BriefcaseBusiness,
    accent: 'var(--match-accent)',
    group: 'primary',
    priority: 3,
    summary: 'Measure fit against a role and surface matched and missing skills.',
    entryPointLabel: 'Match role',
    resultTitle: 'Job match result',
    emptyStateTitle: 'Measure fit against a live role.',
    emptyStateBody: 'Bring your resume and a job description together first.',
    nextActions: [
      { label: 'Write the cover letter', to: 'cover-letter', seed: 'resume+job' },
      { label: 'Prepare interview answers', to: 'interview', seed: 'resume+job' },
    ],
    submitPath: '/job-match/match',
    supportsCvUpload: true,
    supportsJobImport: true,
    authRequiredToRun: false,
    submit: runJobMatch as ToolDefinition['submit'],
  },
  'cover-letter': {
    id: 'cover-letter',
    label: 'Cover Letter',
    shortLabel: 'Letter',
    route: '/cover-letter',
    resultRoute: '/cover-letter/result/$historyId',
    icon: FileText,
    accent: 'var(--letter-accent)',
    group: 'application',
    priority: 4,
    summary: 'Generate a role-specific cover letter anchored in your resume.',
    entryPointLabel: 'Generate cover letter',
    resultTitle: 'Cover letter draft',
    emptyStateTitle: 'Generate a tailored cover letter.',
    emptyStateBody: 'Use a real job description for the strongest first draft.',
    nextActions: [
      { label: 'Practice the interview', to: 'interview', seed: 'resume+job' },
      { label: 'Return to Job Match', to: 'job-match', seed: 'resume+job' },
    ],
    submitPath: '/cover-letter/generate',
    supportsCvUpload: true,
    supportsJobImport: true,
    authRequiredToRun: false,
    submit: runCoverLetter as ToolDefinition['submit'],
  },
  interview: {
    id: 'interview',
    label: 'Interview Q&A',
    shortLabel: 'Interview',
    route: '/interview',
    resultRoute: '/interview/result/$historyId',
    icon: MessagesSquare,
    accent: 'var(--interview-accent)',
    group: 'application',
    priority: 5,
    summary: 'Practice structured questions and suggested answers for the role.',
    entryPointLabel: 'Generate interview deck',
    resultTitle: 'Interview practice deck',
    emptyStateTitle: 'Build your interview practice deck.',
    emptyStateBody: 'Use the same resume and role context to keep answers aligned.',
    nextActions: [
      { label: 'Write the cover letter', to: 'cover-letter', seed: 'resume+job' },
      { label: 'Explore career paths', to: 'career', seed: 'resume' },
    ],
    submitPath: '/interview/questions',
    supportsCvUpload: true,
    supportsJobImport: true,
    authRequiredToRun: false,
    submit: runInterview as ToolDefinition['submit'],
  },
  career: {
    id: 'career',
    label: 'Career Path',
    shortLabel: 'Career',
    route: '/career',
    resultRoute: '/career/result/$historyId',
    icon: Compass,
    accent: 'var(--career-accent)',
    group: 'planning',
    priority: 6,
    summary: 'Compare target directions, timelines, and the skill gaps to close.',
    entryPointLabel: 'Recommend paths',
    resultTitle: 'Career path options',
    emptyStateTitle: 'Explore the next move.',
    emptyStateBody: 'Use your resume to compare realistic transitions and gaps.',
    nextActions: [
      { label: 'Plan portfolio projects', to: 'portfolio', seed: 'resume' },
      { label: 'Refresh the resume', to: 'resume', seed: 'resume' },
    ],
    submitPath: '/career/recommend',
    supportsCvUpload: true,
    supportsJobImport: false,
    authRequiredToRun: false,
    submit: runCareer as ToolDefinition['submit'],
  },
  portfolio: {
    id: 'portfolio',
    label: 'Portfolio Planner',
    shortLabel: 'Portfolio',
    route: '/portfolio',
    resultRoute: '/portfolio/result/$historyId',
    icon: FolderKanban,
    accent: 'var(--portfolio-accent)',
    group: 'planning',
    priority: 2,
    summary: 'Turn career goals into concrete project ideas with skill coverage.',
    entryPointLabel: 'Plan portfolio',
    resultTitle: 'Portfolio roadmap',
    emptyStateTitle: 'Plan the work that proves your fit.',
    emptyStateBody: 'Choose a target role and get project ideas that support it.',
    nextActions: [
      { label: 'Explore career paths', to: 'career', seed: 'resume' },
      { label: 'Return to dashboard', to: 'resume', seed: 'resume' },
    ],
    submitPath: '/portfolio/recommend',
    supportsCvUpload: true,
    supportsJobImport: false,
    authRequiredToRun: false,
    submit: runPortfolio as ToolDefinition['submit'],
  },
}

export const toolList = Object.values(tools).sort(
  (a, b) => a.priority - b.priority,
)

export const toolGroups = {
  primary: toolList.filter((tool) => tool.group === 'primary'),
  application: toolList.filter((tool) => tool.group === 'application'),
  planning: toolList.filter((tool) => tool.group === 'planning'),
}

export function getToolByHistoryName(toolName: string): ToolDefinition | null {
  return toolList.find(
    (tool) =>
      tool.id === toolName ||
      tool.label.toLowerCase() === toolName.toLowerCase() ||
      tool.shortLabel.toLowerCase() === toolName.toLowerCase(),
  ) || null
}

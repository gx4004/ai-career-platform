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
  guestDemoAllowed: boolean
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
    summary: 'Score the resume you have and fix the issues recruiters notice first.',
    entryPointLabel: 'Review resume',
    resultTitle: 'Resume Analyzer',
    emptyStateTitle: 'Review the resume you have now.',
    emptyStateBody: 'Upload once to create the baseline the rest of the workflow uses.',
    nextActions: [
      { label: 'Compare it to a role', to: 'job-match', seed: 'resume' },
      { label: 'Plan your portfolio', to: 'portfolio', seed: 'resume' },
    ],
    submitPath: '/resume/analyze',
    supportsCvUpload: true,
    supportsJobImport: true,
    authRequiredToRun: false,
    guestDemoAllowed: true,
    submit: runResumeAnalysis as unknown as ToolDefinition['submit'],
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
    priority: 2,
    summary: 'Compare your resume to a real role and surface the gaps that matter.',
    entryPointLabel: 'Compare to role',
    resultTitle: 'Job Match',
    emptyStateTitle: 'Compare yourself to a real role.',
    emptyStateBody: 'Paste a job description and see where your current signal is strong or thin.',
    nextActions: [
      { label: 'Write the cover letter', to: 'cover-letter', seed: 'resume+job' },
      { label: 'Prepare interview answers', to: 'interview', seed: 'resume+job' },
    ],
    submitPath: '/job-match/match',
    supportsCvUpload: true,
    supportsJobImport: true,
    authRequiredToRun: false,
    guestDemoAllowed: true,
    submit: runJobMatch as unknown as ToolDefinition['submit'],
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
    summary: 'Draft a tailored letter using your resume and the target job.',
    entryPointLabel: 'Draft cover letter',
    resultTitle: 'Cover Letter',
    emptyStateTitle: 'Draft a tailored cover letter.',
    emptyStateBody: 'Use your resume and a target role to start from something worth refining.',
    nextActions: [
      { label: 'Practice the interview', to: 'interview', seed: 'resume+job' },
      { label: 'Return to Job Match', to: 'job-match', seed: 'resume+job' },
    ],
    submitPath: '/cover-letter/generate',
    supportsCvUpload: true,
    supportsJobImport: true,
    authRequiredToRun: false,
    guestDemoAllowed: true,
    submit: runCoverLetter as unknown as ToolDefinition['submit'],
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
    summary: 'Generate likely questions and stronger answer angles for the role.',
    entryPointLabel: 'Build interview prep',
    resultTitle: 'Interview Prep',
    emptyStateTitle: 'Build role-specific interview prep.',
    emptyStateBody: 'Generate practice questions and better answer angles from your resume plus the role.',
    nextActions: [
      { label: 'Write the cover letter', to: 'cover-letter', seed: 'resume+job' },
      { label: 'Explore career paths', to: 'career', seed: 'resume' },
    ],
    submitPath: '/interview/questions',
    supportsCvUpload: true,
    supportsJobImport: true,
    authRequiredToRun: false,
    guestDemoAllowed: true,
    submit: runInterview as unknown as ToolDefinition['submit'],
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
    priority: 3,
    summary: 'Compare next-step directions, timelines, and missing skills.',
    entryPointLabel: 'Compare career paths',
    resultTitle: 'Career Path',
    emptyStateTitle: 'Explore realistic next moves.',
    emptyStateBody: 'Use your current resume to compare paths, timelines, and skill gaps.',
    nextActions: [
      { label: 'Plan portfolio projects', to: 'portfolio', seed: 'resume' },
      { label: 'Refresh the resume', to: 'resume', seed: 'resume' },
    ],
    submitPath: '/career/recommend',
    supportsCvUpload: true,
    supportsJobImport: false,
    authRequiredToRun: false,
    guestDemoAllowed: true,
    submit: runCareer as unknown as ToolDefinition['submit'],
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
    priority: 6,
    summary: 'Turn career gaps into project ideas that prove your fit.',
    entryPointLabel: 'Plan proof projects',
    resultTitle: 'Portfolio Planner',
    emptyStateTitle: 'Plan proof-building projects.',
    emptyStateBody: 'Choose a direction and turn missing evidence into concrete work you can ship.',
    nextActions: [
      { label: 'Explore career paths', to: 'career', seed: 'resume' },
      { label: 'Return to dashboard', to: 'resume', seed: 'resume' },
    ],
    submitPath: '/portfolio/recommend',
    supportsCvUpload: true,
    supportsJobImport: false,
    authRequiredToRun: false,
    guestDemoAllowed: true,
    submit: runPortfolio as unknown as ToolDefinition['submit'],
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

import {
  Home,
  Workflow,
  Wrench,
  HelpCircle,
} from 'lucide-react'
import type { ToolId } from '#/lib/tools/registry'

export type LandingSectionId =
  | 'hero'
  | 'social-proof'
  | 'resume-demo'
  | 'context-scroll'
  | 'workflow'
  | 'tools'
  | 'faq'
  | 'cta'
  | 'footer'

export const landingPrimaryCta = {
  label: 'Start free',
  to: '/dashboard',
} as const

export const landingWorkflowToolIds: ToolId[] = [
  'resume',
  'job-match',
  'cover-letter',
  'interview',
  'career',
  'portfolio',
]

export const landingWorkflowPhases = [
  {
    id: 'start',
    label: 'Review',
    eyebrow: 'Review the resume',
    description: 'See what is working, what is thin, and what to fix first.',
    toolIds: ['resume', 'job-match'],
  },
  {
    id: 'apply',
    label: 'Apply',
    eyebrow: 'Build the application',
    description: 'Turn the same role into a letter, prep, and talking points.',
    toolIds: ['cover-letter', 'interview'],
  },
  {
    id: 'plan',
    label: 'Plan',
    eyebrow: 'Plan the next move',
    description: 'Use the gaps to choose better projects, paths, and priorities.',
    toolIds: ['career', 'portfolio'],
  },
] as const satisfies Array<{
  id: string
  label: string
  eyebrow: string
  description: string
  toolIds: ToolId[]
}>

export const landingPageSectionOrder: LandingSectionId[] = [
  'hero',
  'resume-demo',
  'workflow',
  'tools',
  'faq',
  'cta',
  'footer',
]

export const landingExperimentSectionOrder: LandingSectionId[] = [
  'hero',
  'social-proof',
  'workflow',
  'tools',
  'faq',
  'cta',
  'footer',
]

export const landingNavbarItems = [
  { label: 'Overview', href: '#landing-hero' },
  { label: 'Proof', href: '#landing-demo' },
  { label: 'Workflow', href: '#landing-journey' },
  { label: 'Tools', href: '#landing-tools' },
  { label: 'FAQ', href: '#landing-faq' },
] as const

export const landingExperimentNavbarItems = [
  { label: 'Overview', href: '#landing-hero', icon: Home },
  { label: 'Workflow', href: '#landing-journey', icon: Workflow },
  { label: 'Tools', href: '#landing-tools', icon: Wrench },
  { label: 'FAQ', href: '#landing-faq', icon: HelpCircle },
] as const

export const landingHeroCopy = {
  classic: {
    headline: 'Turn one resume into a focused job search workflow.',
    body: 'Start with a clear resume signal, align it to one role, and keep the same context across applications and planning.',
    ctaLabel: landingPrimaryCta.label,
  },
  lamp: {
    headline: 'Turn one resume into a sharper job search.',
    body: 'Review the resume, check fit for a real role, then build better application materials and next steps without restarting each tool.',
    ctaLabel: 'Open the workbench',
  },
} as const

export const landingHeroStageCopy = {
  eyebrow: 'Live workspace',
  status: 'Resume loaded',
  pills: ['Resume review', 'Role fit', 'Next moves'],
} as const

export const landingResumeDemoCopy = {
  eyebrow: 'Resume review',
  title: 'Watch your resume get read the way a recruiter reads it.',
  body: 'Upload once. We scan for proof, flag what\u2019s weak, and score what matters \u2014 in seconds.',
} as const

export const landingWorkflowCopy = {
  eyebrow: 'How it works',
  title: 'Review. Aim. Build.',
  body: '',
} as const

export const landingToolsCopy = {
  eyebrow: 'Six tools',
  title: 'Six tools for the search, not six separate tabs.',
  body: 'Each tool does one job well, and they stay connected to the same resume and target role.',
} as const

export const landingExperimentToolsCopy = {
  eyebrow: 'The toolkit',
  title: 'Six focused tools. Zero context switching.',
  body: '',
} as const

export type ExperimentHeroVariant = 'strong' | 'soft'

export const landingExperimentHeroCopy = {
  strong: {
    eyebrow: 'Career Workbench',
    headlinePre: 'Your resume has ',
    headlineAccent: 'blind spots',
    headlineMid: '.',
    headlinePost: 'We find them before recruiters do.',
    body: 'Upload your resume and see exactly what\u2019s working, what\u2019s not, and what to fix first \u2014 in under a minute.',
    ctaLabel: 'Upload your resume \u2014 Free',
    secondaryCtaLabel: 'See how it works',
    trustItems: ['No sign-up required'],
  },
  soft: {
    eyebrow: 'Career Workbench',
    headlinePre: 'Turn your resume into a clear ',
    headlineAccent: 'hiring signal',
    headlineMid: '.',
    headlinePost: 'From review to applications in one place.',
    body: 'Upload your resume and see exactly what\u2019s working, what\u2019s not, and what to fix first \u2014 in under a minute.',
    ctaLabel: 'Upload your resume \u2014 Free',
    secondaryCtaLabel: 'See how it works',
    trustItems: ['No sign-up required'],
  },
} as const

export const landingSocialProofStat = {
  value: '2,400+',
  label: 'resumes analyzed so far',
} as const

export const landingTestimonials = [
  {
    initials: 'AI',
    name: 'Aisha',
    role: 'Product Manager',
    quote:
      'The blind spot analysis found three missing keywords that were keeping me from getting interviews at Tier 1 tech firms.',
  },
  {
    initials: 'DA',
    name: 'Daniel',
    role: 'Data Analyst',
    quote:
      'I finally understand why my profile wasn\u2019t matching. The Job Match tool is a game changer for tailored applications.',
  },
  {
    initials: 'SA',
    name: 'Sarah',
    role: 'Sales Exec',
    quote:
      'Went from zero callbacks to three interviews in one week. The AI-generated cover letters actually sound human.',
  },
  {
    initials: 'TO',
    name: 'Tom\u00e1s',
    role: 'Frontend Engineer',
    quote:
      'Simple, focused, and effective. The workflow moved me from being overwhelmed to being fully prepared.',
  },
] as const

export const landingWorkflowFeatures = [
  {
    step: 'Review',
    title: 'Review the resume you already have',
    content:
      'Get a score, see the strongest proof, and find the first edits worth making before you start rewriting.',
    image: '/ai-generated/carousel/final-job-match.webp',
  },
  {
    step: 'Aim',
    title: 'Check fit against a real role',
    content:
      'Bring in one job posting, compare it to the resume, and turn the gaps into focused application work.',
    image: '/ai-generated/carousel/final-resume.webp',
  },
  {
    step: 'Build',
    title: 'Finish the rest of the search faster',
    content:
      'Create a cover letter, prep for interviews, and plan projects or career moves from the same starting point.',
    image: '/ai-generated/carousel/final-career.webp',
  },
] as const

export const landingToolCopy: Record<
  ToolId,
  {
    phase: 'Start' | 'Apply' | 'Plan'
    summary: string
    contextPills: string[]
    footnote: string
  }
> = {
  resume: {
    phase: 'Start',
    summary: 'Score the draft and get the first fixes worth making.',
    contextPills: ['Score', 'Proof', 'Next edits'],
    footnote: 'Best for getting to the first useful edit fast.',
  },
  'job-match': {
    phase: 'Start',
    summary: 'Compare one role to your resume and see what is still missing.',
    contextPills: ['Role fit', 'Gaps', 'Priority fixes'],
    footnote: 'Use it when you want to aim the search at one real opening.',
  },
  'cover-letter': {
    phase: 'Apply',
    summary: 'Draft a letter that already reflects your experience and the role.',
    contextPills: ['Resume', 'Role', 'Draft'],
    footnote: 'Useful once you know which proof to emphasize.',
  },
  interview: {
    phase: 'Apply',
    summary: 'Practice likely questions with stronger answer angles.',
    contextPills: ['Questions', 'Answer angles', 'Talking points'],
    footnote: 'Keeps prep aligned with the role you are actually targeting.',
  },
  career: {
    phase: 'Plan',
    summary: 'Compare directions, timelines, and the skills you still need.',
    contextPills: ['Paths', 'Skill gaps', 'Timeline'],
    footnote: 'Helpful when you need direction instead of another application asset.',
  },
  portfolio: {
    phase: 'Plan',
    summary: 'Turn missing proof into project ideas you can actually build.',
    contextPills: ['Projects', 'Gaps', 'Roadmap'],
    footnote: 'This is where planning turns into visible proof.',
  },
}

export const landingContextShowcaseCopy = {
  eyebrow: 'Shared context',
  title: 'The baseline, target role, and fixes travel together.',
  body: 'Resume review, matching, applications, and planning all start from the same signal, so your story stays aligned instead of drifting tool by tool.',
} as const

export const landingContextStoryboardSteps = [
  {
    id: 'baseline',
    step: '01',
    eyebrow: 'Resume signal',
    title: 'See the baseline before you rewrite anything.',
    body: 'Score the draft, isolate the strongest proof, and make the next edits visible before you branch into other tools.',
    image: '/ai-generated/carousel/final-resume.webp',
    chips: ['Score', 'Proof', 'Next edits'],
  },
  {
    id: 'match',
    step: '02',
    eyebrow: 'Role context',
    title: 'Lock one target role into the same workspace.',
    body: 'Bring in a posting, compare it against the same resume baseline, and keep the missing proof attached to the session.',
    image: '/ai-generated/carousel/final-job-match.webp',
    chips: ['Role fit', 'Gap map', 'Priority fixes'],
  },
  {
    id: 'apply',
    step: '03',
    eyebrow: 'Application flow',
    title: 'Carry that context into the outputs that matter.',
    body: 'Letters, interview prep, and next-step planning all inherit the same evidence so the story stays sharp as you move.',
    image: '/ai-generated/carousel/final-interview.webp',
    chips: ['Cover letter', 'Interview prep', 'Career plan'],
  },
] as const

export const landingFaqQuestions = [
  {
    id: 'item-1',
    title: 'Can I try Career Workbench without an account?',
    content:
      'Yes. Start as a guest and decide later if you want to save your work.',
  },
  {
    id: 'item-2',
    title: 'Do I need a job description?',
    content:
      'No. Resume review works on its own. Adding a job post makes cover letters and interview prep more specific.',
  },
  {
    id: 'item-3',
    title: 'What carries across tools?',
    content:
      'Your resume, target role, and edits stay connected so each step starts from the same working draft.',
  },
  {
    id: 'item-4',
    title: 'What do I leave with?',
    content:
      'A sharper resume, clearer role fit, better application materials, interview prep, and a next-step plan.',
  },
  {
    id: 'item-5',
    title: 'How is this different from a resume checker?',
    content:
      'A checker stops at feedback. Career Workbench turns that review into role fit, cover letters, prep, and planning.',
  },
] as const

export const landingFaqCopy = {
  eyebrow: 'Questions',
  title: 'Common questions',
  body: 'What to expect before you start.',
  supportHref: '/login',
  supportLabel: 'support team',
} as const

export const landingCtaCopy = {
  eyebrow: 'Ready to see what you\u2019re missing?',
  title: 'Your resume is one upload away from being sharper.',
  body: 'Open Career Workbench and move from review to applications to planning \u2014 all in one place.',
  valueBullets: [
    'Instant resume score & fixes',
    'Cover letter + interview prep',
    'No account needed',
  ],
  ctaLabel: 'Upload your resume \u2014 Free',
  trustLine: `Join ${landingSocialProofStat.value} job seekers who started here`,
} as const

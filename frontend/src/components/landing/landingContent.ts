import {
  Home,
  Workflow,
  Wrench,
  HelpCircle,
} from 'lucide-react'

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

export const landingExperimentSectionOrder: LandingSectionId[] = [
  'hero',
  'social-proof',
  'workflow',
  'tools',
  'faq',
  'cta',
  'footer',
]

export const landingExperimentNavbarItems = [
  { label: 'Overview', href: '#landing-hero', icon: Home },
  { label: 'Workflow', href: '#landing-journey', icon: Workflow },
  { label: 'Tools', href: '#landing-tools', icon: Wrench },
  { label: 'FAQ', href: '#landing-faq', icon: HelpCircle },
] as const

export const landingWorkflowCopy = {
  eyebrow: 'How it works',
  title: 'Review. Aim. Build.',
  body: '',
} as const

export const landingExperimentToolsCopy = {
  eyebrow: 'The toolkit',
  title: 'Six focused tools. Zero context switching.',
  body: '',
} as const

export const landingExperimentHeroCopy = {
  strong: {
    eyebrow: 'Career Workbench',
    headlineAccent: 'blind spots',
    headlinePost: 'We find them before recruiters do.',
    mobileHeadlineLines: ['We find them', 'before recruiters do.'],
    body: 'Upload your resume and see exactly what\u2019s working, what\u2019s not, and what to fix first \u2014 in under a minute.',
    mobileBody: 'Upload your resume and see exactly what\u2019s\nworking, what\u2019s not, and what to fix first\n\u2014 in under a minute.',
    ctaLabel: 'Analyze your CV \u2014 Free',
    secondaryCtaLabel: 'See how it works',
    trustItems: ['No sign-up required'],
  },
} as const

// Social proof: removed for the thesis demo. The previous exports here were
// a fabricated `2,400+ resumes analyzed` stat and four invented testimonials
// (Aisha / Daniel / Sarah / Tom\u00e1s). Real traction numbers and real quotes
// belong here once they exist; until then LandingSocialProof renders a short
// project-disclosure paragraph and consumers should not import a "stat" or
// "testimonials" array from this module.

export const landingWorkflowFeatures = [
  {
    step: 'Review',
    title: 'Review the resume you already have',
    content:
      'Get a score, see the strongest proof, and find the first edits worth making before you start rewriting.',
  },
  {
    step: 'Aim',
    title: 'Check fit against a real role',
    content:
      'Bring in one job posting, compare it to the resume, and turn the gaps into focused application work.',
  },
  {
    step: 'Build',
    title: 'Finish the rest of the search faster',
    content:
      'Create a cover letter, prep for interviews, and plan projects or career moves from the same starting point.',
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
  trustLine: 'Free to try \u2014 no signup required',
} as const

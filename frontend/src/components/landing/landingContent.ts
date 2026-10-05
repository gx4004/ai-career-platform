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

// The funnel starts on the tool itself: /resume has the upload and the paste option, so the first guest
// run is one step away. Every call to action on the page reads this one value.
export const landingPrimaryCta = {
  label: 'Analyze your CV \u2014 Free',
  to: '/resume',
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
  title: 'Review. Aim. Build.',
  body: 'A systematic approach to career growth, powered by AI precision.',
} as const

export const landingExperimentToolsCopy = {
  title: 'Six focused tools. Zero context switching.',
  body: '',
} as const

export const landingExperimentHeroCopy = {
  strong: {
    betaLabel: 'Thesis demo, runs locally',
    headline: 'Your resume has blind spots. We find them before recruiters do.',
    body: 'Upload your resume and see exactly what\u2019s working, what\u2019s not, and what to fix first, in under a minute.',
    ctaLabel: landingPrimaryCta.label,
    secondaryCtaLabel: 'See how it works',
    reassurance: 'No sign-up required. Your data stays yours.',
  },
} as const

/**
 * The example result drawn in the hero collage and again in the closer. These numbers are sample data
 * (the collage is labelled "Example result"). The seal is derived from the four bars, so the card never
 * contradicts itself.
 */
export const landingExampleResult = {
  file: 'Alex Johnson, Software Engineer',
  scores: [
    { label: 'Skills match', value: 88 },
    { label: 'Experience', value: 84 },
    { label: 'Education', value: 82 },
    { label: 'Keywords', value: 80 },
  ],
  fix: {
    title: 'Quantify two more bullets',
    body: 'Attach a number, scope, or outcome to your strongest recent bullets.',
  },
  strength: 'Surfaces relevant tooling, including Python, SQL, FastAPI.',
  jobFit: 75,
} as const

export const landingExampleScore = Math.round(
  landingExampleResult.scores.reduce((sum, s) => sum + s.value, 0) / landingExampleResult.scores.length,
)

export const landingProofCopy = {
  heading: 'Built for',
  audience: {
    lead: 'CS graduates',
    middle: ', bootcamp alumni, ',
    second: 'career switchers',
    tail: ', MBA candidates, PhD researchers, product managers and design leads.',
  },
  noteTitle: 'A thesis project, shown as a demo',
  noteBody:
    'Career Workbench is a thesis project and today it runs as a local demo. The tools are free to try, your data stays in your account, and you can delete it at any time. A free private beta is planned for later.',
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
  {
    id: 'item-6',
    title: 'Is my resume saved if I do not sign in?',
    content:
      'No. A guest result is never saved on the server: it lives in your browser tab and is gone when you leave. Create a free account if you want your runs, history and CV kept.',
  },
  {
    id: 'item-7',
    title: 'Does it apply to jobs for me?',
    content:
      'No. Career Workbench helps you prepare, and you send every application yourself.',
  },
  {
    id: 'item-8',
    title: 'Can I trust the AI feedback?',
    content:
      'Treat it as a sharp second opinion, not a verdict. It can be wrong, so check every suggestion against your real experience before you use it.',
  },
] as const

export const landingCtaCopy = {
  title: 'Your resume is one upload away from being sharper.',
  ctaLabel: 'Upload your resume \u2014 Free',
  trustLine: 'No sign-up required. Your data stays yours.',
} as const

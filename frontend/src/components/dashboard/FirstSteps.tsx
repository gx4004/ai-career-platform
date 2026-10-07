import type { ReactNode } from 'react'
import { Link } from '@tanstack/react-router'
import { DashboardResumeUpload } from '#/components/dashboard/DashboardResumeUpload'
import { Button, NumberDisc, Panel, PanelBody, PanelHeader, Skeleton } from '#/components/kit'
import { useResumeCarry } from '#/hooks/use-resume-carry'

/** tour: the first-run tour's target on this step (the whole step, so its ring never cuts the step's text). */
type Step = { title: string; text: string; done: boolean; body: ReactNode; tour?: string }

/**
 * A newcomer's whole first screen in one list: upload a resume, run the Resume Analyzer, add a job. It stays
 * until the last step is done (the page drops it once an application exists), ticking off what is done: a
 * resume carried in this tab or one already in the account (a CV or a run) is step 1, a run is step 2.
 */
export function FirstSteps({
  signedIn = true,
  resumeIn = false,
  analyzed = false,
}: {
  signedIn?: boolean
  /** The account already has a resume: a CV Studio document or a Resume Analyzer run. */
  resumeIn?: boolean
  /** The Resume Analyzer has run on it. */
  analyzed?: boolean
}) {
  const carry = useResumeCarry()
  // The step to do now carries the page's one primary button, so the next move is obvious (STICKER 5.3).
  const resumeDone = carry.hasResume || resumeIn || analyzed
  const currentIndex = !resumeDone ? 0 : !analyzed ? 1 : 2
  const variantFor = (index: number) => (index === currentIndex ? 'primary' : 'secondary')
  const steps: Step[] = [
    carry.hasResume
      ? {
          title: 'Your resume is ready',
          text: `${carry.filename || 'The resume you added earlier'} is ready to use in every tool.`,
          done: true,
          body: null,
        }
      : resumeIn || analyzed
        ? { title: 'Your resume is in', text: 'Every tool can start from it.', done: true, body: null }
        : {
          title: 'Upload your resume',
          text: 'Every tool builds on it.',
          done: false,
          body: <DashboardResumeUpload />,
          tour: 'hero-cta',
        },
    analyzed
      ? {
          title: 'Resume analyzed',
          text: 'Your score and its fixes are saved in Recent activity.',
          done: true,
          body: null,
        }
      : {
          title: 'Run the Resume Analyzer',
          text: 'A score, and the fixes that move it most.',
          done: false,
          body: (
            <Button asChild variant={variantFor(1)} size="sm">
              <Link to="/resume">{carry.hasResume ? 'Analyze it' : 'Open Resume Analyzer'}</Link>
            </Button>
          ),
        },
    {
      title: 'Add a job you like',
      text: 'See how well you fit, then keep it in Applications.',
      done: false,
      body: (
        <Button asChild variant={variantFor(2)} size="sm">
          {signedIn ? <Link to="/discovery">Discover jobs</Link> : <Link to="/login">Sign in to add jobs</Link>}
        </Button>
      ),
    },
  ]
  const current = steps.findIndex((step) => !step.done)

  return (
    <Panel>
      <PanelHeader title="Your first 3 steps" />
      <PanelBody>
        <ol className="dash-steps">
          {steps.map((step, index) => (
            <li
              key={step.title}
              className="dash-step"
              data-state={step.done ? 'done' : index === current ? 'current' : 'next'}
              data-tour={step.tour}
            >
              <NumberDisc
                n={step.done ? '\u2713' : index + 1}
                size="lg"
                tone={step.done ? 'mint' : index === current ? 'lemon' : 'white'}
              />
              <div className="dash-step__body">
                <h3 className="dash-step__title">{step.title}</h3>
                <p className="dash-step__text">{step.text}</p>
                {step.body}
              </div>
            </li>
          ))}
        </ol>
      </PanelBody>
    </Panel>
  )
}

/**
 * The first steps' frame while the page asks whether a resume is in (an account without applications always gets
 * the first steps): the panel, its title and three steps, so the panel does not appear above everything later.
 */
export function FirstStepsSkeleton() {
  return (
    <Panel aria-busy>
      <PanelHeader title="Your first 3 steps" />
      <PanelBody>
        <ol className="dash-steps" aria-label="Loading your first steps">
          {[0, 1, 2].map((index) => (
            <li key={index} className="dash-step">
              <Skeleton variant="block" shape="circle" width={44} height={44} />
              <div className="dash-step__body">
                <Skeleton variant="line" size="title" width="12rem" />
                <Skeleton variant="line" width="16rem" />
                <Skeleton variant="block" width={index === 0 ? '100%' : '9rem'} height={index === 0 ? 120 : 36} />
              </div>
            </li>
          ))}
        </ol>
      </PanelBody>
    </Panel>
  )
}

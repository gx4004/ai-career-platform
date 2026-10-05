import type { ReactNode } from 'react'
import { Link } from '@tanstack/react-router'
import { DashboardResumeUpload } from '#/components/dashboard/DashboardResumeUpload'
import { Button, NumberDisc, Panel, PanelBody, PanelHeader } from '#/components/kit'
import { useResumeCarry } from '#/hooks/use-resume-carry'

type Step = { title: string; text: string; done: boolean; body: ReactNode }

/**
 * A newcomer's whole first screen in one list: upload a resume, run the Resume Analyzer, add a job.
 * A resume that came with them from before they signed in (carried in this tab) counts as the first step.
 */
export function FirstSteps({ signedIn = true }: { signedIn?: boolean }) {
  const carry = useResumeCarry()
  const steps: Step[] = [
    carry.hasResume
      ? {
          title: 'Your resume is ready',
          text: `${carry.filename || 'The resume you added earlier'} is ready to use in every tool.`,
          done: true,
          body: null,
        }
      : {
          title: 'Upload your resume',
          text: 'Every tool builds on it.',
          done: false,
          body: <DashboardResumeUpload />,
        },
    {
      title: 'Run the Resume Analyzer',
      text: 'A score, and the fixes that move it most.',
      done: false,
      body: (
        <Button asChild variant="secondary" size="sm">
          <Link to="/resume">{carry.hasResume ? 'Analyze it' : 'Open Resume Analyzer'}</Link>
        </Button>
      ),
    },
    {
      title: 'Add a job you like',
      text: 'See how well you fit, then keep it in Applications.',
      done: false,
      body: (
        <Button asChild variant="secondary" size="sm">
          {signedIn ? <Link to="/discovery">Find jobs</Link> : <Link to="/login">Sign in to add jobs</Link>}
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
            <li key={step.title} className="dash-step" data-state={step.done ? 'done' : index === current ? 'current' : 'next'}>
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

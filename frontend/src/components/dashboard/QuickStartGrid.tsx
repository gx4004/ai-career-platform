import type { CSSProperties } from 'react'
import { Link } from '@tanstack/react-router'
import { ArrowRight } from 'lucide-react'
import { StaggerChildren, StaggerItem } from '#/components/ui/motion'
import {
  type ToolDefinition,
  type ToolId,
  tools,
} from '#/lib/tools/registry'
import { toolAccentStyle } from '#/lib/tools/styleUtils'
import thumbResume from '#/assets/carousel/thumb-resume.png'
import thumbJobMatch from '#/assets/carousel/thumb-job-match.png'
import thumbCoverLetter from '#/assets/carousel/thumb-cover-letter.png'
import thumbInterview from '#/assets/carousel/thumb-interview.png'
import thumbCareer from '#/assets/carousel/thumb-career.png'
import thumbPortfolio from '#/assets/carousel/thumb-portfolio.png'

type WorkflowPhase = 'Start' | 'Apply' | 'Plan'

type WorkflowStep = {
  toolId: ToolId
  phase: WorkflowPhase
  helper: string
}

type WorkflowFlight = {
  phase: WorkflowPhase
  steps: WorkflowStep[]
}

const THUMBNAIL_IMAGES: Record<ToolId, string> = {
  resume: thumbResume,
  'job-match': thumbJobMatch,
  'cover-letter': thumbCoverLetter,
  interview: thumbInterview,
  career: thumbCareer,
  portfolio: thumbPortfolio,
}

const THUMBNAIL_IMAGE_SCALE: Record<ToolId, number> = {
  resume: 1.18,
  'job-match': 1.17,
  'cover-letter': 1.13,
  interview: 1.15,
  career: 1.18,
  portfolio: 1.24,
}

const WORKFLOW_STEPS: WorkflowStep[] = [
  {
    toolId: 'resume',
    phase: 'Start',
    helper: 'Start here. Seeds the rest of the workflow.',
  },
  {
    toolId: 'job-match',
    phase: 'Start',
    helper: 'Best after Resume Analyzer. Uses resume + target role.',
  },
  {
    toolId: 'cover-letter',
    phase: 'Apply',
    helper: 'Application step. Best after Job Match.',
  },
  {
    toolId: 'interview',
    phase: 'Apply',
    helper: 'Practice step. Best after Job Match.',
  },
  {
    toolId: 'career',
    phase: 'Plan',
    helper: 'Planning step. Uses your resume to compare directions.',
  },
  {
    toolId: 'portfolio',
    phase: 'Plan',
    helper: 'Proof-building step. Turns goals into project ideas.',
  },
]

const WORKFLOW_FLIGHTS: WorkflowFlight[] = [
  {
    phase: 'Start',
    steps: [WORKFLOW_STEPS[0], WORKFLOW_STEPS[1]],
  },
  {
    phase: 'Apply',
    steps: [WORKFLOW_STEPS[2], WORKFLOW_STEPS[3]],
  },
  {
    phase: 'Plan',
    steps: [WORKFLOW_STEPS[4], WORKFLOW_STEPS[5]],
  },
]

function WorkflowCard({
  step,
  tool,
}: {
  step: WorkflowStep
  tool: ToolDefinition
}) {
  return (
    <Link
      to={tool.route}
      className="quick-tool-card quick-tool-card--workflow"
      style={toolAccentStyle(tool.accent)}
    >
      <div className="quick-tool-card-meta">
        <span className="quick-tool-entry-label">{tool.entryPointLabel}</span>
      </div>
      <div className="grid gap-2">
        <h3 className="section-title">{tool.label}</h3>
        <p className="muted-copy quick-tool-summary">{tool.summary}</p>
        <p className="small-copy quick-tool-helper">{step.helper}</p>
      </div>
      <div
        className="quick-tool-image-frame quick-tool-image-frame--workflow"
        style={
          {
            '--quick-tool-image-scale': THUMBNAIL_IMAGE_SCALE[tool.id],
          } as CSSProperties
        }
      >
        <img
          src={THUMBNAIL_IMAGES[tool.id]}
          alt={`${tool.label} preview`}
          className="quick-tool-image"
          draggable={false}
        />
      </div>
      <div className="quick-tool-card-footer">
        <span>Open tool</span>
        <ArrowRight
          size={16}
          className="quick-tool-card-arrow"
          style={{ color: tool.accent }}
        />
      </div>
    </Link>
  )
}

export function QuickStartGrid() {
  return (
    <section className="grid gap-4" data-tour="quick-start">
      <div className="grid gap-2">
        <p className="eyebrow">Quick start</p>
        <h2 className="section-title">Six tools, one connected workflow</h2>
        <p className="muted-copy quick-start-intro">
          Follow the steps from top to bottom to build your resume foundation,
          move into application prep, and then plan the next proof points for
          your search.
        </p>
      </div>
      <StaggerChildren className="quick-start-timeline" stagger={0.07} delay={0.05}>
        {WORKFLOW_FLIGHTS.map((flight, flightIndex) => (
          <StaggerItem key={flight.phase} className="quick-start-phase-flight">
            <div className="quick-start-phase-heading">
              <span className="quick-start-phase-label">{flight.phase}</span>
            </div>

            <div className="quick-start-phase-steps">
              {flight.steps.map((step, stepIndex) => {
                const tool = tools[step.toolId]
                const stepNumber = flightIndex * 2 + stepIndex + 1
                const isLeft = stepNumber % 2 === 1

                return (
                  <div
                    key={tool.id}
                    className={`quick-start-step-row${isLeft ? ' is-left' : ' is-right'}${
                      stepIndex === 1 ? ' quick-start-step-row--offset' : ''
                    }`}
                  >
                    <div className="quick-start-step-lane quick-start-step-lane--left">
                      {isLeft ? (
                        <div className="quick-start-step-card-wrap quick-start-step-card-wrap--left">
                          <WorkflowCard step={step} tool={tool} />
                          <span
                            className="quick-start-card-connector quick-start-card-connector--left"
                            aria-hidden
                          />
                        </div>
                      ) : null}
                    </div>

                    <div className="quick-start-step-center">
                      <div
                        className="quick-start-step-marker"
                        aria-label={`Step ${stepNumber}`}
                      >
                        <span>{stepNumber}</span>
                      </div>
                    </div>

                    <div className="quick-start-step-lane quick-start-step-lane--right">
                      {isLeft ? null : (
                        <div className="quick-start-step-card-wrap quick-start-step-card-wrap--right">
                          <span
                            className="quick-start-card-connector quick-start-card-connector--right"
                            aria-hidden
                          />
                          <WorkflowCard step={step} tool={tool} />
                        </div>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          </StaggerItem>
        ))}
      </StaggerChildren>
    </section>
  )
}

import { Link } from '@tanstack/react-router'
import { ArrowRight } from 'lucide-react'
import { StaggerChildren, StaggerItem } from '#/components/ui/motion'
import {
  type ToolId,
  tools,
} from '#/lib/tools/registry'
import { toolAccentStyle } from '#/lib/tools/styleUtils'

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

const WORKFLOW_STEPS: WorkflowStep[] = [
  {
    toolId: 'resume',
    phase: 'Start',
    helper: 'Start here — seeds every tool that follows.',
  },
  {
    toolId: 'job-match',
    phase: 'Start',
    helper: 'Best after Resume Analyzer. Compares resume to a live role.',
  },
  {
    toolId: 'cover-letter',
    phase: 'Apply',
    helper: 'Uses your resume and role match to draft a letter.',
  },
  {
    toolId: 'interview',
    phase: 'Apply',
    helper: 'Builds practice questions from your role match.',
  },
  {
    toolId: 'career',
    phase: 'Plan',
    helper: 'Compares career directions using your resume data.',
  },
  {
    toolId: 'portfolio',
    phase: 'Plan',
    helper: 'Turns career goals into concrete project ideas.',
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
  tool: typeof tools[ToolId]
}) {
  const Icon = tool.icon
  return (
    <Link
      to={tool.route}
      className="quick-tool-card quick-tool-card--workflow"
      style={toolAccentStyle(tool.accent)}
    >
      <div className="quick-tool-card-header">
        <div className="quick-tool-card-icon-block" aria-hidden>
          <Icon size={22} />
        </div>
        <div className="quick-tool-card-body">
          <h3 className="quick-tool-card-title">{tool.label}</h3>
          <p className="quick-tool-card-summary">{tool.summary}</p>
        </div>
      </div>
      <p className="quick-tool-card-helper">{step.helper}</p>
      <div className="quick-tool-card-footer">
        <span>{tool.entryPointLabel}</span>
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
        <p className="eyebrow">Your workflow</p>
        <h2 className="section-title">Every step feeds the next</h2>
        <p className="muted-copy quick-start-intro">
          Begin with your resume. Each tool passes context forward — by the time
          you reach interview prep, the groundwork is already done.
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

                    <div
                      className="quick-start-step-center"
                      style={toolAccentStyle(tool.accent)}
                    >
                      <div
                        className="quick-start-step-marker"
                        aria-label={`Step ${stepNumber}`}
                      >
                        <tool.icon size={18} />
                        <span className="quick-start-step-number">{stepNumber}</span>
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

import { useState } from 'react'
import { useNavigate } from '@tanstack/react-router'
import {
  ArrowRight,
  ChevronLeft,
  FileText,
  Compass,
  Sparkles,
  Target,
  Rocket,
  CheckCircle2,
} from 'lucide-react'
import { Dialog, DialogContent, DialogTitle } from '#/components/ui/dialog'
import { Button } from '#/components/ui/button'
import { OnboardingProgress } from '#/components/onboarding/OnboardingProgress'
import { toolList } from '#/lib/tools/registry'

type OnboardingGoal = 'job-search' | 'career-change' | 'interview-prep'

const goals: Array<{ id: OnboardingGoal; label: string; description: string; icon: typeof Target }> = [
  {
    id: 'job-search',
    label: 'Active job search',
    description: 'Find and apply to roles that match your skills',
    icon: Target,
  },
  {
    id: 'career-change',
    label: 'Career transition',
    description: 'Explore new directions and close skill gaps',
    icon: Compass,
  },
  {
    id: 'interview-prep',
    label: 'Interview preparation',
    description: 'Practice answers and build confidence',
    icon: Sparkles,
  },
]

const TOTAL_STEPS = 5

export function OnboardingDialog({
  open,
  onComplete,
  onSkip,
  onOpenChange,
}: {
  open: boolean
  onComplete: () => void
  onSkip: () => void
  onOpenChange: (open: boolean) => void
}) {
  const [step, setStep] = useState(0)
  const [selectedGoal, setSelectedGoal] = useState<OnboardingGoal | null>(null)
  const navigate = useNavigate()

  function next() {
    if (step < TOTAL_STEPS - 1) {
      setStep(step + 1)
    } else {
      onComplete()
      const route = selectedGoal === 'interview-prep'
        ? '/interview'
        : selectedGoal === 'career-change'
          ? '/career'
          : '/resume'
      void navigate({ to: route })
    }
  }

  function back() {
    if (step > 0) setStep(step - 1)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="onboarding-dialog">
        <DialogTitle className="sr-only">Welcome to Career Workbench</DialogTitle>
        <div className="onboarding-dialog-inner">
          <OnboardingProgress currentStep={step} totalSteps={TOTAL_STEPS} />

          <div className="onboarding-body" aria-live="polite">
            {step === 0 && (
              <div className="onboarding-step">
                <div className="onboarding-welcome-visual">
                  <div className="onboarding-welcome-ring">
                    <Rocket size={28} />
                  </div>
                </div>
                <div className="onboarding-step-header">
                  <h3 className="onboarding-title">Welcome to Career Workbench</h3>
                  <p className="onboarding-description">
                    Your AI-powered career suite that connects resume analysis, job matching, and application prep into one focused workflow.
                  </p>
                </div>
              </div>
            )}

            {step === 1 && (
              <div className="onboarding-step">
                <div className="onboarding-step-header">
                  <h3 className="onboarding-title">Start with your resume</h3>
                  <p className="onboarding-description">
                    Upload your CV to unlock the full power of the workflow. Every tool builds on your resume data.
                  </p>
                </div>
                <div className="onboarding-upload-hint">
                  <div className="onboarding-upload-icon">
                    <FileText size={22} />
                  </div>
                  <div>
                    <p className="onboarding-upload-label">PDF or text</p>
                    <p className="small-copy muted-copy">
                      Upload a PDF or paste your resume text in the Resume Analyzer.
                    </p>
                  </div>
                </div>
              </div>
            )}

            {step === 2 && (
              <div className="onboarding-step">
                <div className="onboarding-step-header">
                  <h3 className="onboarding-title">Choose your goal</h3>
                  <p className="onboarding-description">
                    Select your primary use case so we can recommend the best starting point.
                  </p>
                </div>
                <div className="onboarding-goals">
                  {goals.map((goal) => (
                    <button
                      key={goal.id}
                      type="button"
                      className={`onboarding-goal-card ${selectedGoal === goal.id ? 'is-selected' : ''}`}
                      onClick={() => setSelectedGoal(goal.id)}
                    >
                      <div className="onboarding-goal-icon">
                        <goal.icon size={18} />
                      </div>
                      <div className="onboarding-goal-text">
                        <p className="onboarding-goal-label">{goal.label}</p>
                        <p className="onboarding-goal-desc">{goal.description}</p>
                      </div>
                      {selectedGoal === goal.id && (
                        <CheckCircle2 size={18} className="onboarding-goal-check" />
                      )}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {step === 3 && (
              <div className="onboarding-step">
                <div className="onboarding-step-header">
                  <h3 className="onboarding-title">Explore your tools</h3>
                  <p className="onboarding-description">
                    Six AI-powered tools line up as one connected workflow, from resume foundation into application prep and planning.
                  </p>
                </div>
                <div className="onboarding-tools-preview">
                  {toolList.map((tool) => (
                    <div key={tool.id} className="onboarding-tool-chip">
                      <div
                        className="onboarding-tool-chip-icon"
                        style={{ background: `color-mix(in srgb, ${tool.accent} 12%, transparent)` }}
                      >
                        <tool.icon size={14} style={{ color: tool.accent }} />
                      </div>
                      <span>{tool.shortLabel}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {step === 4 && (
              <div className="onboarding-step">
                <div className="onboarding-welcome-visual">
                  <div className="onboarding-ready-ring">
                    <CheckCircle2 size={28} />
                  </div>
                </div>
                <div className="onboarding-step-header">
                  <h3 className="onboarding-title">You're all set!</h3>
                  <p className="onboarding-description">
                    {selectedGoal === 'interview-prep'
                      ? 'We recommend starting with Interview Q&A to practice structured answers.'
                      : selectedGoal === 'career-change'
                        ? 'We recommend starting with Career Path to explore new directions.'
                        : 'We recommend starting with Resume Analyzer to build your workflow foundation.'}
                  </p>
                </div>
              </div>
            )}
          </div>

          <div className="onboarding-footer">
            <Button variant="ghost" onClick={onSkip} className="onboarding-skip">
              Skip tour
            </Button>
            <div className="flex gap-2">
              {step > 0 && (
                <Button variant="outline" onClick={back} className="onboarding-back">
                  <ChevronLeft size={16} />
                  Back
                </Button>
              )}
              <Button onClick={next} className="onboarding-next">
                {step === TOTAL_STEPS - 1 ? 'Get started' : 'Continue'}
                <ArrowRight size={16} />
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

import { useState } from 'react'
import { useNavigate } from '@tanstack/react-router'
import {
  ArrowRight,
  FileText,
  Compass,
  Sparkles,
  Target,
  Rocket,
} from 'lucide-react'
import { Dialog, DialogContent, DialogTitle } from '#/components/ui/dialog'
import { Button } from '#/components/ui/button'
import { Badge } from '#/components/ui/badge'
import { OnboardingStep } from '#/components/onboarding/OnboardingStep'
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
              <OnboardingStep
                title="Welcome to Career Workbench"
                description="Your AI-powered career suite that connects resume analysis, job matching, and application prep into one focused workflow."
              >
                <div className="onboarding-welcome-visual">
                  <Rocket size={48} className="onboarding-welcome-icon" />
                </div>
              </OnboardingStep>
            )}

            {step === 1 && (
              <OnboardingStep
                title="Start with your resume"
                description="Upload your CV to unlock the full power of the workflow. Every tool builds on your resume data."
              >
                <div className="onboarding-upload-hint">
                  <FileText size={32} style={{ color: 'var(--accent)' }} />
                  <p className="small-copy muted-copy">
                    You can upload a PDF or paste your resume text in the Resume Analyzer tool.
                  </p>
                </div>
              </OnboardingStep>
            )}

            {step === 2 && (
              <OnboardingStep
                title="Choose your goal"
                description="Select your primary use case so we can recommend the best starting point."
              >
                <div className="onboarding-goals">
                  {goals.map((goal) => (
                    <button
                      key={goal.id}
                      type="button"
                      className={`onboarding-goal-card ${selectedGoal === goal.id ? 'is-selected' : ''}`}
                      onClick={() => setSelectedGoal(goal.id)}
                    >
                      <goal.icon size={20} style={{ color: 'var(--accent)' }} />
                      <div>
                        <p className="section-title">{goal.label}</p>
                        <p className="small-copy muted-copy">{goal.description}</p>
                      </div>
                    </button>
                  ))}
                </div>
              </OnboardingStep>
            )}

            {step === 3 && (
              <OnboardingStep
                title="Explore your tools"
                description="Six AI-powered tools work together in one connected workflow."
              >
                <div className="onboarding-tools-preview">
                  {toolList.map((tool) => (
                    <div key={tool.id} className="onboarding-tool-chip">
                      <div
                        className="onboarding-tool-chip-icon"
                        style={{ background: `color-mix(in srgb, ${tool.accent} 14%, transparent)` }}
                      >
                        <tool.icon size={14} style={{ color: tool.accent }} />
                      </div>
                      <span>{tool.shortLabel}</span>
                    </div>
                  ))}
                </div>
              </OnboardingStep>
            )}

            {step === 4 && (
              <OnboardingStep
                title="You're all set!"
                description={
                  selectedGoal === 'interview-prep'
                    ? 'We recommend starting with Interview Q&A to practice structured answers.'
                    : selectedGoal === 'career-change'
                      ? 'We recommend starting with Career Path to explore new directions.'
                      : 'We recommend starting with Resume Analyzer to build your workflow foundation.'
                }
              >
                <div className="onboarding-ready-visual">
                  <Badge variant="outline" className="onboarding-ready-badge">
                    Ready to go
                  </Badge>
                </div>
              </OnboardingStep>
            )}
          </div>

          <div className="onboarding-footer">
            <Button variant="ghost" onClick={onSkip} className="onboarding-skip">
              Skip tour
            </Button>
            <div className="flex gap-2">
              {step > 0 && (
                <Button variant="outline" onClick={back}>
                  Back
                </Button>
              )}
              <Button onClick={next} className="button-hero-primary">
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

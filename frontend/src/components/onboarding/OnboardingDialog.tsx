import { useEffect, useRef, useState } from 'react'
import { useNavigate } from '@tanstack/react-router'
import {
  Button,
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  List,
  Notice,
  RadioGroup,
  RadioItem,
  Row,
  RowBody,
  RowLeading,
  RowSubtitle,
  RowTitle,
} from '#/components/kit'
import { toolList } from '#/lib/tools/registry'

type OnboardingGoal = 'job-search' | 'career-change' | 'interview-prep'

const goals: Array<{ id: OnboardingGoal; label: string; description: string }> = [
  {
    id: 'job-search',
    label: 'Active job search',
    description: 'Find and apply to roles that match your skills',
  },
  {
    id: 'career-change',
    label: 'Career transition',
    description: 'Explore new directions and close skill gaps',
  },
  {
    id: 'interview-prep',
    label: 'Interview preparation',
    description: 'Practice answers and build confidence',
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
  const nextRef = useRef<HTMLButtonElement | null>(null)

  // A replayed tour starts from the welcome again.
  useEffect(() => {
    if (!open) {
      setStep(0)
      setSelectedGoal(null)
    }
  }, [open])

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

  const recommendation =
    selectedGoal === 'interview-prep'
      ? 'We recommend starting with Interview Q&A to practice structured answers.'
      : selectedGoal === 'career-change'
        ? 'We recommend starting with Career Path to explore new directions.'
        : 'We recommend starting with Resume Analyzer to build your workflow foundation.'

  const copy = [
    {
      title: 'Welcome to Career Workbench',
      description:
        'Your AI-powered career suite that connects resume analysis, job matching, and application prep into one focused workflow.',
    },
    {
      title: 'Start with your resume',
      description:
        'Upload your CV to unlock the full power of the workflow. Every tool builds on your resume data.',
    },
    {
      title: 'Choose your goal',
      description: 'Select your primary use case so we can recommend the best starting point.',
    },
    {
      title: 'Explore your tools',
      description:
        'Six AI-powered tools line up as one connected workflow, from resume foundation into application prep and planning.',
    },
    { title: "You're all set!", description: recommendation },
  ][step]

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        size="md"
        onOpenAutoFocus={(event) => {
          event.preventDefault()
          nextRef.current?.focus()
        }}
      >
        <p role="status" className="kit-sr-only">
          Step {step + 1} of {TOTAL_STEPS}: {copy.title}
        </p>
        <DialogHeader>
          <p className="onboarding__progress">
            Step {step + 1} of {TOTAL_STEPS}
          </p>
          <DialogTitle>{copy.title}</DialogTitle>
          <DialogDescription>{copy.description}</DialogDescription>
        </DialogHeader>

        {step === 1 ? (
          <DialogBody>
            <Notice title="PDF or text" icon={false}>
              Upload a PDF or paste your resume text in the Resume Analyzer.
            </Notice>
          </DialogBody>
        ) : null}

        {step === 2 ? (
          <DialogBody>
            <RadioGroup
              aria-label="Your goal"
              variant="card"
              value={selectedGoal ?? ''}
              onValueChange={(value) => setSelectedGoal(value as OnboardingGoal)}
            >
              {goals.map((goal) => (
                <RadioItem key={goal.id} value={goal.id} label={goal.label} description={goal.description} />
              ))}
            </RadioGroup>
          </DialogBody>
        ) : null}

        {step === 3 ? (
          <DialogBody>
            <List aria-label="Tools">
              {toolList.map((tool) => (
                <Row key={tool.id}>
                  <RowLeading>
                    <tool.icon aria-hidden />
                  </RowLeading>
                  <RowBody>
                    <RowTitle>{tool.label}</RowTitle>
                    <RowSubtitle>{tool.summary}</RowSubtitle>
                  </RowBody>
                </Row>
              ))}
            </List>
          </DialogBody>
        ) : null}

        <DialogFooter>
          <Button type="button" variant="ghost" className="onboarding__skip" onClick={onSkip}>
            Skip tour
          </Button>
          {step > 0 ? (
            <Button type="button" variant="secondary" onClick={back}>
              Back
            </Button>
          ) : null}
          <Button ref={nextRef} type="button" onClick={next}>
            {step === TOTAL_STEPS - 1 ? 'Get started' : 'Continue'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

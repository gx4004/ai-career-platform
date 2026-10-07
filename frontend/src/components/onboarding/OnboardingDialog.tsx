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
  NumberDisc,
  RadioGroup,
  RadioItem,
  Row,
  RowBody,
  RowLeading,
  RowSubtitle,
  RowTitle,
  Stack,
  ToolTile,
} from '#/components/kit'
import { toolList, tools, type ToolId } from '#/lib/tools/registry'

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

/** The welcome's body: the six tools as three things you get (the steps all share one height on a phone). */
const welcomeLines = [
  { title: 'Score your resume', detail: 'And see the fixes that move it most.' },
  { title: 'Match it to a job', detail: 'Then write the cover letter and prepare for the interview.' },
  { title: 'Plan what comes next', detail: 'A career path, and projects for the skills you are missing.' },
]

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

  const startTool: ToolId =
    selectedGoal === 'interview-prep' ? 'interview' : selectedGoal === 'career-change' ? 'career' : 'resume'
  const recommendation =
    selectedGoal === 'interview-prep'
      ? 'We suggest starting with Interview Q&A to practice structured answers.'
      : selectedGoal === 'career-change'
        ? 'We suggest starting with Career Path to compare the directions open to you.'
        : 'We suggest starting with Resume Analyzer: a score, and the fixes that move it most.'

  const copy = [
    {
      title: 'Welcome to Career Workbench',
      description: 'Six tools that work from your resume: score it, match it to a job, plan, write and prepare.',
    },
    {
      title: 'Start with your resume',
      description: 'Every tool reads your resume, so add it first.',
    },
    {
      title: 'Choose your goal',
      description: 'Pick what you are working on, and we suggest where to start.',
    },
    {
      title: 'Explore your tools',
      description: 'Each tool can start from your resume and from the last result, so the work carries from one to the next.',
    },
    { title: "You're all set!", description: recommendation },
  ][step]

  return (
    // Closing it any other way (Esc, the X, the scrim) is a skip: the tour is answered and never comes back by itself.
    <Dialog open={open} onOpenChange={(next) => (next ? onOpenChange(true) : onSkip())}>
      {/* Anchored to the top: the steps differ in height, and a re-centred dialog would move Continue every step.
          The corner X is the skip (closing is a skip, see above); on the last step there is nothing left to skip. */}
      <DialogContent
        size="md"
        placement="top"
        className="onboarding-dialog"
        closeLabel={step === TOTAL_STEPS - 1 ? 'Close' : 'Skip tour'}
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
            <NumberDisc n={step + 1} size="sm" tone="lemon" />
            Step {step + 1} of {TOTAL_STEPS}
          </p>
          <DialogTitle>{copy.title}</DialogTitle>
          <DialogDescription>{copy.description}</DialogDescription>
        </DialogHeader>

        {step === 0 ? (
          <DialogBody>
            <List aria-label="What you get">
              {welcomeLines.map((line, index) => (
                <Row key={line.title}>
                  <RowLeading>
                    <NumberDisc n={index + 1} size="sm" />
                  </RowLeading>
                  <RowBody>
                    <RowTitle>{line.title}</RowTitle>
                    <RowSubtitle>{line.detail}</RowSubtitle>
                  </RowBody>
                </Row>
              ))}
            </List>
          </DialogBody>
        ) : null}

        {step === 1 ? (
          <DialogBody>
            <Notice title="PDF, DOCX or text" icon={false}>
              Upload a PDF or DOCX, or paste the text, in the Resume Analyzer.
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
                    <ToolTile tone={tool.tone} icon={tool.icon} size="md" />
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

        {step === TOTAL_STEPS - 1 ? (
          <DialogBody>
            <Stack gap={4}>
              <List aria-label="Where you start">
                <Row>
                  <RowLeading>
                    <ToolTile tone={tools[startTool].tone} icon={tools[startTool].icon} size="md" />
                  </RowLeading>
                  <RowBody>
                    <RowTitle>{tools[startTool].label}</RowTitle>
                    <RowSubtitle>{tools[startTool].summary}</RowSubtitle>
                  </RowBody>
                </Row>
              </List>
              <Notice icon={false}>You can replay this tour from Settings.</Notice>
            </Stack>
          </DialogBody>
        ) : null}

        {/* Back and Continue only, side by side on a phone too: a third row of buttons took the room of the lists. */}
        <DialogFooter phoneLayout="row">
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

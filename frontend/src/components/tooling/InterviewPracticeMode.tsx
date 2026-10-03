import { useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { ArrowLeft, ArrowRight, Send, RotateCcw } from 'lucide-react'
import {
  Badge,
  Button,
  Cluster,
  Count,
  Field,
  KeyValue,
  Lead,
  Notice,
  Section,
  Stack,
  Textarea,
} from '#/components/kit'
import { Lines, Prose, ResultList } from '#/components/tooling/ResultParts'
import { runInterviewPracticeFeedback } from '#/lib/api/client'
import type { InterviewPracticeFeedback } from '#/lib/api/schemas'

const MAX_ATTEMPTS = 3

interface Question {
  question?: string
  answerStructure?: string[]
  focusArea?: string
  answer?: string
  keyPoints?: string[]
}

function FeedbackList({ title, items }: { title: string; items: string[] }) {
  if (items.length === 0) return null
  return (
    <Section headingLevel={3} size="sm" title={title} rule={false}>
      <ResultList label={title} items={items.map((item, i) => ({ key: `${i}-${item}`, title: item }))} />
    </Section>
  )
}

export function InterviewPracticeMode({
  questions,
  onExit,
}: {
  questions: Question[]
  onExit: () => void
}) {
  const [currentIndex, setCurrentIndex] = useState(0)
  const [answer, setAnswer] = useState('')
  const [feedback, setFeedback] = useState<InterviewPracticeFeedback | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [attempts, setAttempts] = useState<Record<number, number>>(() => {
    try {
      const stored = sessionStorage.getItem('cw:practice-attempts')
      return stored ? JSON.parse(stored) : {}
    } catch { return {} }
  })

  const questionRef = useRef<HTMLParagraphElement | null>(null)

  // Switching from the report to practice replaces the button that was just pressed: start at the question.
  useEffect(() => {
    questionRef.current?.focus()
  }, [])

  const current = questions[currentIndex]
  if (!current) return null
  const questionText = current.question || `Question ${currentIndex + 1}`
  const attemptCount = attempts[currentIndex] ?? 0
  const maxedOut = attemptCount >= MAX_ATTEMPTS

  const handleSubmit = async () => {
    setLoading(true)
    setFeedback(null)
    setError(null)

    try {
      const modelAnswer = current.answer
        ? current.answer
        : current.answerStructure?.length
          ? current.answerStructure.join('\n')
          : ''

      const result = await runInterviewPracticeFeedback({
        question: questionText,
        user_answer: answer,
        model_answer: modelAnswer,
      })
      setFeedback(result)
      // Only consume an attempt once the LLM successfully responded. A
      // network blip or 5xx used to burn one of three attempts on a request
      // the user never got feedback for.
      setAttempts((prev) => {
        const next = { ...prev, [currentIndex]: attemptCount + 1 }
        try { sessionStorage.setItem('cw:practice-attempts', JSON.stringify(next)) } catch {}
        return next
      })
    } catch (err) {
      setFeedback(null)
      setError(
        err instanceof Error && err.message
          ? err.message
          : "Couldn't evaluate your answer. Please try again.",
      )
    } finally {
      setLoading(false)
    }
  }

  const goNext = () => {
    if (currentIndex < questions.length - 1) {
      setCurrentIndex(currentIndex + 1)
      setAnswer('')
      setFeedback(null)
      setError(null)
    }
  }

  const goPrev = () => {
    if (currentIndex > 0) {
      setCurrentIndex(currentIndex - 1)
      setAnswer('')
      setFeedback(null)
      setError(null)
    }
  }

  const modelAnswerBlocks: ReactNode = (
    <KeyValue
      divided={false}
      labelWidth="7rem"
      items={[
        ...(current.answerStructure?.length
          ? [{ label: 'Structure', value: <Lines items={current.answerStructure} /> }]
          : []),
        ...(current.keyPoints?.length ? [{ label: 'Key points', value: <Lines items={current.keyPoints} /> }] : []),
      ]}
    />
  )

  return (
    <Stack gap={6}>
      <Cluster justify="between">
        <Button type="button" variant="link" className="tool-link" onClick={onExit}>
          <ArrowLeft aria-hidden="true" />
          Back to results
        </Button>
        <Count value={`${currentIndex + 1} / ${questions.length}`} aria-label={`Question ${currentIndex + 1} of ${questions.length}`} />
      </Cluster>

      <Stack gap={2} aria-live="polite" aria-atomic="true">
        <Cluster>
          <Badge>{current.focusArea || 'Question'}</Badge>
          <Count value={`Attempt ${Math.min(attemptCount + 1, MAX_ATTEMPTS)} / ${MAX_ATTEMPTS}`} />
        </Cluster>
        <Lead ref={questionRef} tabIndex={-1}>
          {questionText}
        </Lead>
      </Stack>

      {maxedOut ? (
        <Section headingLevel={2} title="Maximum attempts reached" description="Here's the model answer for this question:">
          <Stack gap={3}>
            {current.answer ? <Prose>{current.answer}</Prose> : null}
            {modelAnswerBlocks}
            <div>
              <Button type="button" onClick={goNext} disabled={currentIndex >= questions.length - 1}>
                Move to next question
                <ArrowRight aria-hidden="true" />
              </Button>
            </div>
          </Stack>
        </Section>
      ) : (
        <Stack gap={3}>
          <Field label="Your answer">
            <Textarea
              placeholder="Type your answer here..."
              value={answer}
              onChange={(e) => setAnswer(e.target.value)}
              rows={6}
              disabled={loading}
            />
          </Field>
          <Cluster>
            <Button type="button" onClick={handleSubmit} loading={loading}>
              <Send aria-hidden="true" />
              {loading ? 'Evaluating...' : 'Submit answer'}
            </Button>
            {feedback && attemptCount < MAX_ATTEMPTS && (
              <Button
                type="button"
                variant="secondary"
                onClick={() => {
                  setAnswer('')
                  setFeedback(null)
                  setError(null)
                }}
              >
                <RotateCcw aria-hidden="true" />
                Try again
              </Button>
            )}
          </Cluster>
          {error && !loading ? <Notice tone="danger">{error}</Notice> : null}
        </Stack>
      )}

      <div aria-live="polite">
        {feedback && !maxedOut && (
          <Section headingLevel={2} title="Feedback">
            <Stack gap={6}>
              <Prose>{feedback.overall_feedback}</Prose>
              <FeedbackList title="Strengths" items={feedback.strengths} />
              <FeedbackList title="Areas to improve" items={feedback.weaknesses} />
              <FeedbackList title="Suggestions" items={feedback.suggestions} />
            </Stack>
          </Section>
        )}
      </div>

      <Cluster justify="between">
        <Button type="button" variant="secondary" onClick={goPrev} disabled={currentIndex === 0}>
          <ArrowLeft aria-hidden="true" />
          Previous
        </Button>
        <Button type="button" variant="secondary" onClick={goNext} disabled={currentIndex >= questions.length - 1}>
          Next
          <ArrowRight aria-hidden="true" />
        </Button>
      </Cluster>
    </Stack>
  )
}

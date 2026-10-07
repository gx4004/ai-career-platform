import { useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { ArrowLeft, ArrowRight, ListChecks, RotateCcw, Send } from 'lucide-react'
import {
  Badge,
  Button,
  Cluster,
  Count,
  Disclosure,
  Field,
  KeyValue,
  Lead,
  List,
  Notice,
  Panel,
  PanelHeader,
  Row,
  RowBody,
  RowMeta,
  RowSubtitle,
  RowTitle,
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

type Attempt = { answer: string; feedback: InterviewPracticeFeedback }
type AttemptsByQuestion = Record<number, Attempt[]>

/** Attempts live in this tab, per interview run and per question: another run starts at attempt 1. */
const storageKey = (runId: string | undefined) => `cw:practice:${runId ?? 'adhoc'}`

function readAttempts(runId: string | undefined): AttemptsByQuestion {
  try {
    const stored = sessionStorage.getItem(storageKey(runId))
    const parsed = stored ? (JSON.parse(stored) as unknown) : null
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? (parsed as AttemptsByQuestion) : {}
  } catch {
    return {}
  }
}

function writeAttempts(runId: string | undefined, attempts: AttemptsByQuestion) {
  try {
    sessionStorage.setItem(storageKey(runId), JSON.stringify(attempts))
  } catch {
    // storage blocked: the attempts stay in memory for this visit
  }
}

/**
 * Where each question's current round starts: the number of its attempts made before "Practice the weakest again".
 * A new round gives three more attempts and keeps the earlier ones (with their feedback) on the page and in the summary.
 */
type RoundStarts = Record<number, number>
const roundsKey = (runId: string | undefined) => `cw:practice-rounds:${runId ?? 'adhoc'}`

function readRounds(runId: string | undefined): RoundStarts {
  try {
    const stored = sessionStorage.getItem(roundsKey(runId))
    const parsed = stored ? (JSON.parse(stored) as unknown) : null
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? (parsed as RoundStarts) : {}
  } catch {
    return {}
  }
}

function writeRounds(runId: string | undefined, rounds: RoundStarts) {
  try {
    sessionStorage.setItem(roundsKey(runId), JSON.stringify(rounds))
  } catch {
    // storage blocked: the round stays in memory for this visit
  }
}

function FeedbackList({ title, items, last = false }: { title: string; items: string[]; last?: boolean }) {
  if (items.length === 0) return null
  return (
    <Section headingLevel={4} size="xs" title={title} rule={false}>
      {/* Each item is a full sentence of feedback: regular weight, as the report's other sentence lists (F41). */}
      {/* A rule closes each group; the last one is closed by the attempt panel's own edge (no double rule). */}
      <ResultList framed={false} flush boxed={last ? undefined : 'end'} label={title} items={items.map((item, i) => ({ key: `${i}-${item}`, title: item, titleWeight: 'regular' as const }))} />
    </Section>
  )
}

function FeedbackBody({ feedback }: { feedback: InterviewPracticeFeedback }) {
  return (
    <Stack gap={4}>
      <Prose>{feedback.overall_feedback}</Prose>
      <FeedbackList title="Strengths" items={feedback.strengths} last={!feedback.weaknesses.length && !feedback.suggestions.length} />
      <FeedbackList title="Areas to improve" items={feedback.weaknesses} last={!feedback.suggestions.length} />
      <FeedbackList title="Suggestions" items={feedback.suggestions} last />
    </Stack>
  )
}

/** Did the last attempt leave fewer things to improve than the first? The feedback's own list decides. */
function improved(attempts: Attempt[]) {
  return attempts.length >= 2 && attempts[attempts.length - 1].feedback.weaknesses.length < attempts[0].feedback.weaknesses.length
}

const suggestionCount = (n: number) => `${n} ${n === 1 ? 'suggestion' : 'suggestions'}`

/**
 * "2 to improve"; "No weak spots · 1 suggestion" when only suggestions are left (it said "Nothing to improve"
 * above a Suggestions list); "Nothing to improve" only when the feedback found nothing at all (never "0 to improve").
 */
function toImprove(feedback: InterviewPracticeFeedback) {
  const weak = feedback.weaknesses.length
  const tips = feedback.suggestions.length
  if (weak > 0) return `${weak} to improve`
  return tips > 0 ? `No weak spots · ${suggestionCount(tips)}` : 'Nothing to improve'
}

function lastLeft(list: Attempt[]) {
  const { weaknesses, suggestions } = list[list.length - 1].feedback
  if (weaknesses.length > 0) return `${weaknesses.length} to improve in the last one.`
  return suggestions.length > 0
    ? `no weak spots in the last one, ${suggestionCount(suggestions.length)}.`
    : 'nothing left to improve.'
}

export function InterviewPracticeMode({
  questions,
  onExit,
  runId,
}: {
  questions: Question[]
  onExit: () => void
  /** The interview run being practiced, so its attempts are not mixed with another run's. */
  runId?: string
}) {
  const [currentIndex, setCurrentIndex] = useState(0)
  const [answer, setAnswer] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [summaryOpen, setSummaryOpen] = useState(false)
  const [attempts, setAttempts] = useState<AttemptsByQuestion>(() => readAttempts(runId))
  const [rounds, setRounds] = useState<RoundStarts>(() => readRounds(runId))

  const rootRef = useRef<HTMLDivElement | null>(null)
  const questionRef = useRef<HTMLParagraphElement | null>(null)
  const summaryBackRef = useRef<HTMLButtonElement | null>(null)

  // Every view change (entering practice, Next/Previous, opening or closing the summary) replaces the control that
  // was just pressed, and usually shortens the page: scroll the practice block to its top (so the question and the
  // answer box are on screen together) and then move focus into the new view without a second scroll.
  const view = summaryOpen ? 'summary' : currentIndex
  useEffect(() => {
    const reduced = typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
    rootRef.current?.scrollIntoView?.({ block: 'start', behavior: reduced ? 'auto' : 'smooth' })
    const target = view === 'summary' ? summaryBackRef.current : questionRef.current
    target?.focus({ preventScroll: true })
  }, [view])

  const current = questions[currentIndex]
  if (!current) return null
  const questionText = current.question || `Question ${currentIndex + 1}`
  const done = attempts[currentIndex] ?? []
  // Attempts before this round stay listed (as "Earlier round"); only this round's count against the three.
  const roundStart = Math.min(rounds[currentIndex] ?? 0, done.length)
  const attemptCount = done.length - roundStart
  const maxedOut = attemptCount >= MAX_ATTEMPTS
  const practiced = questions.filter((_, i) => (attempts[i]?.length ?? 0) > 0).length

  const record = (next: AttemptsByQuestion) => {
    setAttempts(next)
    writeAttempts(runId, next)
  }

  const handleSubmit = async () => {
    if (!answer.trim()) return
    setLoading(true)
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
      // Only consume an attempt once the LLM successfully responded: a network blip or 5xx must not
      // burn one of three attempts on a request the user never got feedback for.
      record({ ...attempts, [currentIndex]: [...done, { answer, feedback: result }] })
    } catch (err) {
      setError(
        err instanceof Error && err.message
          ? err.message
          : "Couldn't evaluate your answer. Please try again.",
      )
    } finally {
      setLoading(false)
    }
  }

  const goTo = (index: number) => {
    setCurrentIndex(index)
    setAnswer('')
    setError(null)
    setSummaryOpen(false)
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

  if (summaryOpen) {
    const weakest = questions
      .map((_, index) => ({ index, last: attempts[index]?.[attempts[index].length - 1] }))
      .filter((entry): entry is { index: number; last: Attempt } => Boolean(entry.last))
      .sort((a, b) => b.last.feedback.weaknesses.length - a.last.feedback.weaknesses.length || a.index - b.index)[0]
    // A new round of three attempts for the weakest question; its earlier answers and feedback stay.
    const practiceAgain = () => {
      if (!weakest) return
      const next = { ...rounds, [weakest.index]: attempts[weakest.index]?.length ?? 0 }
      setRounds(next)
      writeRounds(runId, next)
      goTo(weakest.index)
    }
    return (
      <Stack gap={6} ref={rootRef} className="result-practice">
        <Cluster justify="between">
          <Button ref={summaryBackRef} type="button" variant="link" className="tool-link" onClick={() => setSummaryOpen(false)}>
            <ArrowLeft aria-hidden="true" />
            Back to practice
          </Button>
          <Count value={`${practiced} of ${questions.length} practiced`} />
        </Cluster>
        <Panel flush>
          <PanelHeader title="Practice summary" />
          <List framed={false} aria-label="Practice summary">
            {questions.map((q, index) => {
              const list = attempts[index] ?? []
              return (
                <Row key={`${index}-${q.question}`}>
                  <RowBody>
                    <RowTitle>{q.question || `Question ${index + 1}`}</RowTitle>
                    {list.length > 0 ? (
                      <RowSubtitle>{`${list.length} ${list.length === 1 ? 'attempt' : 'attempts'}; ${lastLeft(list)}`}</RowSubtitle>
                    ) : null}
                  </RowBody>
                  {/* The status is the row's one "Not practiced yet"; on a phone it drops under the text so the question keeps the full width. */}
                  <RowMeta placement="below">
                    {list.length === 0 ? (
                      <Badge tone="stone">Not practiced yet</Badge>
                    ) : improved(list) ? (
                      <Badge tone="mint">Improved</Badge>
                    ) : list.length >= 2 ? (
                      <Badge tone="lemon">Same</Badge>
                    ) : (
                      <Badge tone="lilac">One try</Badge>
                    )}
                  </RowMeta>
                </Row>
              )
            })}
          </List>
        </Panel>
        <Cluster>
          {weakest ? (
            <Button type="button" onClick={practiceAgain}>
              <RotateCcw aria-hidden="true" />
              Practice the weakest again
            </Button>
          ) : null}
          <Button type="button" variant="secondary" onClick={() => setSummaryOpen(false)}>
            Keep practicing
          </Button>
        </Cluster>
      </Stack>
    )
  }

  return (
    <Stack gap={6} ref={rootRef} className="result-practice">
      <Cluster justify="between">
        <Button type="button" variant="link" className="tool-link" onClick={onExit}>
          <ArrowLeft aria-hidden="true" />
          Back to results
        </Button>
        <Cluster>
          <Count value={`${currentIndex + 1} / ${questions.length}`} aria-label={`Question ${currentIndex + 1} of ${questions.length}`} />
          <Button type="button" variant="secondary" size="sm" disabled={practiced === 0} onClick={() => setSummaryOpen(true)}>
            <ListChecks aria-hidden="true" />
            See summary
          </Button>
        </Cluster>
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

      {maxedOut ? null : (
        <Stack gap={3}>
          <Field label="Your answer">
            <Textarea
              placeholder="Type your answer here…"
              value={answer}
              onChange={(e) => setAnswer(e.target.value)}
              rows={6}
              disabled={loading}
            />
          </Field>
          <Cluster>
            <Button type="button" onClick={handleSubmit} loading={loading} disabled={!answer.trim()}>
              <Send aria-hidden="true" />
              {loading ? 'Evaluating…' : 'Submit answer'}
            </Button>
          </Cluster>
          {error && !loading ? <Notice tone="danger">{error}</Notice> : null}
        </Stack>
      )}

      <div aria-live="polite">
        {done.length > 0 && (
          <Section headingLevel={2} title="Your attempts" count={done.length}>
            <Stack gap={3}>
              {[...done]
                .map((attempt, i) => ({ attempt, n: i + 1 }))
                .reverse()
                .map(({ attempt, n }) => (
                  // The attempt is the framed object: its Disclosure row sits directly in the panel (no second set of rules).
                  <Panel key={`${n}-${n === done.length}`} flush tone={n === done.length ? 'white' : 'stone'}>
                    <Disclosure
                      variant="section"
                      defaultOpen={n === done.length}
                      title={n <= roundStart ? `Earlier round · attempt ${n}` : `Attempt ${n - roundStart}`}
                      meta={toImprove(attempt.feedback)}
                    >
                      <Stack gap={4}>
                        <Prose>
                          <strong>Your answer: </strong>
                          {attempt.answer}
                        </Prose>
                        <FeedbackBody feedback={attempt.feedback} />
                      </Stack>
                    </Disclosure>
                  </Panel>
                ))}
            </Stack>
          </Section>
        )}
      </div>

      {maxedOut ? (
        <Section headingLevel={2} title="Maximum attempts reached" description="Here's the model answer for this question:">
          <Stack gap={3}>
            {current.answer ? <Prose>{current.answer}</Prose> : null}
            {modelAnswerBlocks}
            <Cluster>
              {currentIndex < questions.length - 1 ? (
                <Button type="button" onClick={() => goTo(currentIndex + 1)}>
                  Move to next question
                  <ArrowRight aria-hidden="true" />
                </Button>
              ) : (
                <Button type="button" onClick={() => setSummaryOpen(true)}>
                  <ListChecks aria-hidden="true" />
                  See your summary
                </Button>
              )}
            </Cluster>
          </Stack>
        </Section>
      ) : null}

      <Cluster justify="between">
        <Button type="button" variant="secondary" onClick={() => goTo(currentIndex - 1)} disabled={currentIndex === 0}>
          <ArrowLeft aria-hidden="true" />
          Previous
        </Button>
        <Button type="button" variant="secondary" onClick={() => goTo(currentIndex + 1)} disabled={currentIndex >= questions.length - 1}>
          Next
          <ArrowRight aria-hidden="true" />
        </Button>
      </Cluster>
    </Stack>
  )
}

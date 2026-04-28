import { useState } from 'react'
import { ArrowLeft, ArrowRight, Send, RotateCcw } from 'lucide-react'
import { Button } from '#/components/ui/button'
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

  return (
    <div className="practice-mode">
      <div className="practice-mode-header">
        <Button variant="ghost" size="sm" onClick={onExit}>
          <ArrowLeft size={14} /> Back to results
        </Button>
        <span className="practice-mode-progress">
          {currentIndex + 1} / {questions.length}
        </span>
      </div>

      <div className="practice-mode-question">
        <div className="practice-mode-difficulty">
          {current.focusArea || 'Question'}
        </div>
        <h3>{questionText}</h3>
        <span className="practice-mode-attempt-label">
          Attempt {Math.min(attemptCount + 1, MAX_ATTEMPTS)} / {MAX_ATTEMPTS}
        </span>
      </div>

      {maxedOut ? (
        <div className="practice-mode-maxed">
          <h4>Maximum attempts reached</h4>
          <p>Here's the model answer for this question:</p>
          {current.answer ? (
            <div className="practice-mode-ideal-answer practice-mode-ideal-answer--body">
              {current.answer}
            </div>
          ) : null}
          {current.answerStructure?.length ? (
            <div className="practice-mode-ideal-block">
              <span className="practice-mode-ideal-block__label">Structure</span>
              <ul className="practice-mode-ideal-list">
                {current.answerStructure.map((step) => (
                  <li key={step}>{step}</li>
                ))}
              </ul>
            </div>
          ) : null}
          {current.keyPoints?.length ? (
            <div className="practice-mode-ideal-block">
              <span className="practice-mode-ideal-block__label">Key points</span>
              <ul className="practice-mode-ideal-list">
                {current.keyPoints.map((point) => (
                  <li key={point}>{point}</li>
                ))}
              </ul>
            </div>
          ) : null}
          <Button onClick={goNext} disabled={currentIndex >= questions.length - 1}>
            Move to next question <ArrowRight size={14} />
          </Button>
        </div>
      ) : (
        <>
          <textarea
            className="practice-mode-answer"
            placeholder="Type your answer here..."
            value={answer}
            onChange={(e) => setAnswer(e.target.value)}
            rows={6}
            disabled={loading}
          />

          <div className="practice-mode-actions">
            <Button
              onClick={handleSubmit}
              disabled={loading}
              size="sm"
            >
              {loading ? 'Evaluating...' : <><Send size={14} /> Submit answer</>}
            </Button>
            {feedback && attemptCount < MAX_ATTEMPTS && (
              <Button variant="outline" size="sm" onClick={() => { setAnswer(''); setFeedback(null); setError(null) }}>
                <RotateCcw size={14} /> Try again
              </Button>
            )}
          </div>

          {error && !loading && (
            <div className="practice-mode-error" role="alert">
              {error}
            </div>
          )}
        </>
      )}

      {feedback && !maxedOut && (
        <div className="practice-mode-feedback">
          <p className="practice-mode-overall">{feedback.overall_feedback}</p>

          {feedback.strengths.length > 0 && (
            <div className="practice-feedback-section practice-feedback-strengths">
              <h4>Strengths</h4>
              <ul>{feedback.strengths.map((s, i) => <li key={i}>{s}</li>)}</ul>
            </div>
          )}

          {feedback.weaknesses.length > 0 && (
            <div className="practice-feedback-section practice-feedback-weaknesses">
              <h4>Areas to improve</h4>
              <ul>{feedback.weaknesses.map((w, i) => <li key={i}>{w}</li>)}</ul>
            </div>
          )}

          {feedback.suggestions.length > 0 && (
            <div className="practice-feedback-section practice-feedback-suggestions">
              <h4>Suggestions</h4>
              <ul>{feedback.suggestions.map((s, i) => <li key={i}>{s}</li>)}</ul>
            </div>
          )}
        </div>
      )}

      <div className="practice-mode-nav">
        <Button variant="outline" size="sm" onClick={goPrev} disabled={currentIndex === 0}>
          <ArrowLeft size={14} /> Previous
        </Button>
        <Button variant="outline" size="sm" onClick={goNext} disabled={currentIndex >= questions.length - 1}>
          Next <ArrowRight size={14} />
        </Button>
      </div>
    </div>
  )
}

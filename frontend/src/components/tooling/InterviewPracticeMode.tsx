import { useState } from 'react'
import { ArrowLeft, ArrowRight, Send, RotateCcw } from 'lucide-react'
import { Button } from '#/components/ui/button'

const MAX_ATTEMPTS = 3

interface Question {
  question?: string
  text?: string
  answer_structure?: string | string[]
  key_talking_points?: string[]
  difficulty?: string
  answerStructure?: string[]
  focusArea?: string
}

interface PracticeFeedback {
  strengths: string[]
  weaknesses: string[]
  suggestions: string[]
  overall_feedback: string
  is_empty_answer: boolean
}

function getIdealAnswer(q: Question): string {
  const structure = q.answerStructure || q.answer_structure
  const parts: string[] = []
  if (structure) {
    parts.push(Array.isArray(structure) ? structure.join('\n') : structure)
  }
  if (q.key_talking_points?.length) {
    parts.push('Key points: ' + q.key_talking_points.join(', '))
  }
  return parts.join('\n\n') || 'Review the answer framework above for guidance.'
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
  const [feedback, setFeedback] = useState<PracticeFeedback | null>(null)
  const [loading, setLoading] = useState(false)
  const [attempts, setAttempts] = useState<Record<number, number>>(() => {
    try {
      const stored = sessionStorage.getItem('cw:practice-attempts')
      return stored ? JSON.parse(stored) : {}
    } catch { return {} }
  })

  const current = questions[currentIndex]
  if (!current) return null
  const questionText = current.question || current.text || `Question ${currentIndex + 1}`
  const attemptCount = attempts[currentIndex] ?? 0
  const maxedOut = attemptCount >= MAX_ATTEMPTS

  const handleSubmit = async () => {
    setLoading(true)
    setFeedback(null)

    const newCount = attemptCount + 1
    setAttempts((prev) => {
      const next = { ...prev, [currentIndex]: newCount }
      try { sessionStorage.setItem('cw:practice-attempts', JSON.stringify(next)) } catch {}
      return next
    })

    try {
      const structure = current.answerStructure || current.answer_structure
      const modelAnswer = Array.isArray(structure)
        ? structure.join('\n')
        : typeof structure === 'string'
          ? structure
          : ''

      const res = await fetch(`${import.meta.env.VITE_API_URL}/interview/practice-feedback`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          question: questionText,
          user_answer: answer,
          model_answer: modelAnswer,
        }),
      })
      if (res.ok) {
        setFeedback(await res.json())
      }
    } catch {
      // Silent fail
    } finally {
      setLoading(false)
    }
  }

  const goNext = () => {
    if (currentIndex < questions.length - 1) {
      setCurrentIndex(currentIndex + 1)
      setAnswer('')
      setFeedback(null)
    }
  }

  const goPrev = () => {
    if (currentIndex > 0) {
      setCurrentIndex(currentIndex - 1)
      setAnswer('')
      setFeedback(null)
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
          {current.focusArea || current.difficulty || 'Question'}
        </div>
        <h3>{questionText}</h3>
        <span className="practice-mode-attempt-label">
          Attempt {Math.min(attemptCount + 1, MAX_ATTEMPTS)} / {MAX_ATTEMPTS}
        </span>
      </div>

      {maxedOut ? (
        <div className="practice-mode-maxed">
          <h4>Maximum attempts reached</h4>
          <p>Here's the ideal answer framework for this question:</p>
          <div className="practice-mode-ideal-answer" style={{ whiteSpace: 'pre-line' }}>
            {getIdealAnswer(current)}
          </div>
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
              <Button variant="outline" size="sm" onClick={() => { setAnswer(''); setFeedback(null) }}>
                <RotateCcw size={14} /> Try again
              </Button>
            )}
          </div>
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

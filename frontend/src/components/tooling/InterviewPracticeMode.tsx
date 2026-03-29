import { useState } from 'react'
import { ArrowLeft, ArrowRight, Send, RotateCcw } from 'lucide-react'
import { Button } from '#/components/ui/button'

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

  const current = questions[currentIndex]
  if (!current) return null
  const questionText = current.question || current.text || `Question ${currentIndex + 1}`

  const handleSubmit = async () => {
    setLoading(true)
    setFeedback(null)
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
      </div>

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
        {feedback && (
          <Button variant="outline" size="sm" onClick={() => { setAnswer(''); setFeedback(null) }}>
            <RotateCcw size={14} /> Try again
          </Button>
        )}
      </div>

      {feedback && (
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

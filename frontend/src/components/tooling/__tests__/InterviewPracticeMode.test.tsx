import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { InterviewPracticeMode } from '#/components/tooling/InterviewPracticeMode'
import { resultDefinitions } from '#/lib/tools/resultDefinitions'
import { tools } from '#/lib/tools/registry'

const feedbackMock = vi.hoisted(() => vi.fn())
vi.mock('#/lib/api/client', async (importOriginal) => ({
  ...(await importOriginal<typeof import('#/lib/api/client')>()),
  runInterviewPracticeFeedback: feedbackMock,
}))

const questions = [
  { question: 'Tell me about a migration.', focusArea: 'Schema Design', answer: 'Model answer one.', answerStructure: ['Situation', 'Result'], keyPoints: ['Scope'] },
  { question: 'How do you lead?', focusArea: 'Leadership' },
]

describe('InterviewPracticeMode', () => {
  beforeEach(() => {
    feedbackMock.mockReset()
    window.sessionStorage.clear()
  })

  it('starts at the question, and the answer box is named', () => {
    render(<InterviewPracticeMode questions={questions} onExit={() => {}} />)
    expect(document.activeElement?.textContent).toBe('Tell me about a migration.')
    expect(screen.getByLabelText('Your answer')).toBeTruthy()
    expect(screen.getByLabelText('Question 1 of 2').textContent).toBe('1 / 2')
    expect(screen.getByRole('button', { name: /Previous/ }).hasAttribute('disabled')).toBe(true)
  })

  it('shows feedback as lists after a submit, counts the attempt, and clears on Try again', async () => {
    feedbackMock.mockResolvedValue({
      strengths: ['Concrete outcome.'],
      weaknesses: ['Too long.'],
      suggestions: ['Lead with the decision.'],
      overall_feedback: 'A solid story.',
      is_empty_answer: false,
    })
    render(<InterviewPracticeMode questions={questions} onExit={() => {}} />)
    fireEvent.change(screen.getByLabelText('Your answer'), { target: { value: 'I led it.' } })
    fireEvent.click(screen.getByRole('button', { name: 'Submit answer' }))
    expect(await screen.findByText('A solid story.')).toBeTruthy()
    expect(screen.getByRole('heading', { name: 'Strengths' })).toBeTruthy()
    expect(screen.getByRole('list', { name: 'Areas to improve' }).textContent).toContain('Too long.')
    expect(screen.getByText('Attempt 2 / 3')).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
    expect((screen.getByLabelText('Your answer') as HTMLTextAreaElement).value).toBe('')
    expect(screen.queryByText('A solid story.')).toBeNull()
  })

  it('does not burn an attempt on a failed request and shows the error as an alert', async () => {
    feedbackMock.mockRejectedValue(new Error('Practice feedback is unavailable right now.'))
    render(<InterviewPracticeMode questions={questions} onExit={() => {}} />)
    fireEvent.click(screen.getByRole('button', { name: 'Submit answer' }))
    expect((await screen.findByRole('alert')).textContent).toContain('Practice feedback is unavailable right now.')
    expect(screen.getByText('Attempt 1 / 3')).toBeTruthy()
  })

  it('reveals the model answer after three attempts and moves on', () => {
    window.sessionStorage.setItem('cw:practice-attempts', JSON.stringify({ 0: 3 }))
    render(<InterviewPracticeMode questions={questions} onExit={() => {}} />)
    expect(screen.getByRole('heading', { name: 'Maximum attempts reached' })).toBeTruthy()
    expect(screen.getByText('Model answer one.')).toBeTruthy()
    expect(screen.queryByLabelText('Your answer')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: /Move to next question/ }))
    expect(screen.getByText('How do you lead?')).toBeTruthy()
    expect(screen.getByLabelText('Your answer')).toBeTruthy()
  })

  it('puts focus back on the Practice mode button when practice is left', async () => {
    const payload = {
      summary: { headline: 'h' },
      questions: [{ question: 'Q1?', focus_area: 'Area', why_asked: 'Because.', practice_first: true, answer: 'A', key_points: ['k'] }],
    }
    const item = { id: 'i1' } as never
    render(<>{resultDefinitions.interview.render(payload, item, tools.interview)}</>)
    fireEvent.click(screen.getByRole('button', { name: 'Practice mode' }))
    expect(screen.getByRole('button', { name: /Back to results/ })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: /Back to results/ }))
    await waitFor(() => expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Practice mode' })))
  })
})

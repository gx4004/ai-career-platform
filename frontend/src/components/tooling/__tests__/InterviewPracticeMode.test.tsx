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

  const feedback = (weaknesses: string[] = ['Too long.']) => ({
    strengths: ['Concrete outcome.'],
    weaknesses,
    suggestions: ['Lead with the decision.'],
    overall_feedback: 'A solid story.',
    is_empty_answer: false,
  })

  const submit = async (text: string) => {
    fireEvent.change(screen.getByLabelText('Your answer'), { target: { value: text } })
    fireEvent.click(screen.getByRole('button', { name: 'Submit answer' }))
  }

  it('shows feedback as lists after a submit and counts the attempt', async () => {
    feedbackMock.mockResolvedValue(feedback())
    render(<InterviewPracticeMode runId="run-a" questions={questions} onExit={() => {}} />)
    await submit('I led it.')
    expect(await screen.findByText('A solid story.')).toBeTruthy()
    expect(screen.getByRole('heading', { name: 'Strengths' })).toBeTruthy()
    expect(screen.getByRole('list', { name: 'Areas to improve' }).textContent).toContain('Too long.')
    expect(screen.getByText('Attempt 2 / 3')).toBeTruthy()
  })

  it('does not accept an empty answer, so no attempt is burned', () => {
    render(<InterviewPracticeMode runId="run-a" questions={questions} onExit={() => {}} />)
    expect(screen.getByRole('button', { name: 'Submit answer' }).hasAttribute('disabled')).toBe(true)
    fireEvent.change(screen.getByLabelText('Your answer'), { target: { value: '   ' } })
    expect(screen.getByRole('button', { name: 'Submit answer' }).hasAttribute('disabled')).toBe(true)
    expect(feedbackMock).not.toHaveBeenCalled()
  })

  it('does not burn an attempt on a failed request and shows the error as an alert', async () => {
    feedbackMock.mockRejectedValue(new Error('Practice feedback is unavailable right now.'))
    render(<InterviewPracticeMode runId="run-a" questions={questions} onExit={() => {}} />)
    await submit('An answer.')
    expect((await screen.findByRole('alert')).textContent).toContain('Practice feedback is unavailable right now.')
    expect(screen.getByText('Attempt 1 / 3')).toBeTruthy()
  })

  it('stacks every attempt, shows the third one is feedback too, then the model answer', async () => {
    feedbackMock
      .mockResolvedValueOnce({ ...feedback(['a', 'b', 'c']), overall_feedback: 'First read.' })
      .mockResolvedValueOnce({ ...feedback(['a', 'b']), overall_feedback: 'Second read.' })
      .mockResolvedValueOnce({ ...feedback(['a']), overall_feedback: 'Third read.' })
    render(<InterviewPracticeMode runId="run-a" questions={questions} onExit={() => {}} />)
    await submit('One.')
    await screen.findByText('First read.')
    await submit('Two.')
    await screen.findByText('Second read.')
    await submit('Three.')
    // The evaluation the user just waited for is shown, and so is what comes after it.
    expect(await screen.findByText('Third read.')).toBeTruthy()
    expect(screen.getByRole('heading', { name: 'Maximum attempts reached' })).toBeTruthy()
    expect(screen.getByText('Model answer one.')).toBeTruthy()
    expect(screen.getByRole('button', { name: /Attempt 1/ })).toBeTruthy()
    expect(screen.getByRole('button', { name: /Attempt 2/ })).toBeTruthy()
    expect(screen.queryByLabelText('Your answer')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: /Move to next question/ }))
    expect(screen.getByText('How do you lead?')).toBeTruthy()
    expect(screen.getByLabelText('Your answer')).toBeTruthy()
  })

  it('keeps attempts apart by run: another run starts at attempt 1', async () => {
    window.sessionStorage.setItem(
      'cw:practice:run-a',
      JSON.stringify({ 0: [1, 2, 3].map((n) => ({ answer: `a${n}`, feedback: feedback() })) }),
    )
    const { unmount } = render(<InterviewPracticeMode runId="run-a" questions={questions} onExit={() => {}} />)
    expect(screen.getByRole('heading', { name: 'Maximum attempts reached' })).toBeTruthy()
    unmount()
    render(<InterviewPracticeMode runId="run-b" questions={questions} onExit={() => {}} />)
    expect(screen.queryByRole('heading', { name: 'Maximum attempts reached' })).toBeNull()
    expect(screen.getByText('Attempt 1 / 3')).toBeTruthy()
    expect(screen.getByLabelText('Your answer')).toBeTruthy()
  })

  it('ends with a summary of which questions improved and practises the weakest again', async () => {
    window.sessionStorage.setItem(
      'cw:practice:run-a',
      JSON.stringify({
        0: [
          { answer: 'a', feedback: feedback(['x', 'y', 'z']) },
          { answer: 'b', feedback: feedback(['x']) },
        ],
        1: [{ answer: 'c', feedback: feedback(['x', 'y']) }],
      }),
    )
    render(<InterviewPracticeMode runId="run-a" questions={questions} onExit={() => {}} />)
    fireEvent.click(screen.getByRole('button', { name: /See summary/ }))
    // The summary replaced the button that opened it: focus moves into it, not to the body.
    expect(document.activeElement).toBe(screen.getByRole('button', { name: /Back to practice/ }))
    const list = screen.getByRole('list', { name: 'Practice summary' })
    expect(list.textContent).toContain('Improved')
    expect(list.textContent).toContain('One try')
    fireEvent.click(screen.getByRole('button', { name: /Practise the weakest again/ }))
    // Question 2 had the most left to improve: it is back at attempt 1.
    expect(screen.getByText('How do you lead?')).toBeTruthy()
    expect(screen.getByText('Attempt 1 / 3')).toBeTruthy()
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

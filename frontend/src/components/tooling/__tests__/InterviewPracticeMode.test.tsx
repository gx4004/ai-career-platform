import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
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
    // Inside the attempt's Panel: an xs heading under the attempt title, an unframed flush list (RSR-02, RSR-06).
    expect(screen.getByRole('heading', { name: 'Strengths' }).closest('.kit-section')?.getAttribute('data-size')).toBe('xs')
    const strengths = screen.getByRole('list', { name: 'Strengths' })
    expect(strengths.hasAttribute('data-framed')).toBe(false)
    expect(strengths.getAttribute('data-flush')).toBe('true')
    expect(strengths.getAttribute('data-boxed')).toBe('end')
    // The last group is closed by the attempt panel's own edge, not a second rule just above it (RSR-V02).
    expect(screen.getByRole('list', { name: 'Suggestions' }).hasAttribute('data-boxed')).toBe(false)
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

  it('brings the new question and its answer box into view on Next and on the summary', () => {
    const scrolled = vi.fn()
    const original = Element.prototype.scrollIntoView
    Element.prototype.scrollIntoView = scrolled
    try {
      window.sessionStorage.setItem('cw:practice:run-s', JSON.stringify({ 0: [{ answer: 'a', feedback: feedback() }] }))
      render(<InterviewPracticeMode runId="run-s" questions={questions} onExit={() => {}} />)
      scrolled.mockClear()
      fireEvent.click(screen.getByRole('button', { name: /Next/ }))
      // The page gets shorter when the attempts go: without a scroll the viewport is left below the question.
      expect(scrolled).toHaveBeenCalledTimes(1)
      expect((scrolled.mock.contexts[0] as HTMLElement).contains(screen.getByLabelText('Your answer'))).toBe(true)
      expect(document.activeElement?.textContent).toBe('How do you lead?')
      scrolled.mockClear()
      fireEvent.click(screen.getByRole('button', { name: /See summary/ }))
      expect(scrolled).toHaveBeenCalledTimes(1)
      expect(document.activeElement).toBe(screen.getByRole('button', { name: /Back to practice/ }))
    } finally {
      Element.prototype.scrollIntoView = original
    }
  })

  it('says "Not practiced yet" once per unpractised summary row, in a status that drops under the text on a phone', () => {
    window.sessionStorage.setItem('cw:practice:run-n', JSON.stringify({ 0: [{ answer: 'a', feedback: feedback() }] }))
    render(<InterviewPracticeMode runId="run-n" questions={questions} onExit={() => {}} />)
    fireEvent.click(screen.getByRole('button', { name: /See summary/ }))
    const rows = within(screen.getByRole('list', { name: 'Practice summary' })).getAllByRole('listitem')
    // Subtitle and badge both said it (F18): the badge alone carries it now.
    expect(rows[1].textContent?.match(/Not practiced yet/g)).toHaveLength(1)
    // The status takes the kit's below placement, so on a narrow list the question keeps the full row width.
    for (const row of rows) expect(row.querySelector('.kit-row__meta')?.getAttribute('data-placement')).toBe('below')
  })

  it('says "Nothing to improve" instead of "0 to improve" only when the feedback has no suggestion either', () => {
    window.sessionStorage.setItem(
      'cw:practice:run-z',
      JSON.stringify({ 0: [{ answer: 'a', feedback: { ...feedback([]), suggestions: [] } }] }),
    )
    render(<InterviewPracticeMode runId="run-z" questions={questions} onExit={() => {}} />)
    expect(screen.getByText('Nothing to improve')).toBeTruthy()
    expect(screen.queryByText(/0 to improve/)).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: /See summary/ }))
    expect(screen.getByText('1 attempt; nothing left to improve.')).toBeTruthy()
  })

  // No weak spots but a suggestion used to read "Nothing to improve" right above a Suggestions list.
  it('counts the suggestions when there are no weak spots, instead of saying there is nothing to improve', () => {
    window.sessionStorage.setItem('cw:practice:run-y', JSON.stringify({ 0: [{ answer: 'a', feedback: feedback([]) }] }))
    render(<InterviewPracticeMode runId="run-y" questions={questions} onExit={() => {}} />)
    expect(screen.getByText('No weak spots · 1 suggestion')).toBeTruthy()
    expect(screen.queryByText('Nothing to improve')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: /See summary/ }))
    expect(screen.getByText('1 attempt; no weak spots in the last one, 1 suggestion.')).toBeTruthy()
  })

  it('ends with a summary of which questions improved and practices the weakest again', async () => {
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
    fireEvent.click(screen.getByRole('button', { name: /Practice the weakest again/ }))
    // Question 2 had the most left to improve: it gets a new round of three attempts...
    expect(screen.getByText('How do you lead?')).toBeTruthy()
    expect(screen.getByText('Attempt 1 / 3')).toBeTruthy()
    // ...and keeps what it already had (sign-off tool-results-F65: the earlier answer and its feedback were erased).
    expect(screen.getByRole('button', { name: /Earlier round · attempt 1/ })).toBeTruthy()
    expect(JSON.parse(window.sessionStorage.getItem('cw:practice:run-a') ?? '{}')[1]).toHaveLength(1)
    feedbackMock.mockResolvedValue(feedback(['x']))
    await submit('A better answer.')
    expect(await screen.findByText('Attempt 2 / 3')).toBeTruthy()
    expect(screen.getByRole('button', { name: /^Attempt 1/ })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: /See summary/ }))
    const rows = within(screen.getByRole('list', { name: 'Practice summary' })).getAllByRole('listitem')
    expect(rows[1].textContent).toContain('2 attempts')
    expect(rows[1].textContent).toContain('Improved')
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

import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { OnboardingDialog } from '#/components/onboarding/OnboardingDialog'

const navigate = vi.hoisted(() => vi.fn())
vi.mock('@tanstack/react-router', () => ({ useNavigate: () => navigate }))

function renderDialog(open = true) {
  const handlers = { onComplete: vi.fn(), onSkip: vi.fn(), onOpenChange: vi.fn() }
  const ui = (isOpen: boolean) => <OnboardingDialog open={isOpen} {...handlers} />
  const view = render(ui(open))
  return { ...view, ...handlers, ui }
}

const next = () => fireEvent.click(screen.getByRole('button', { name: 'Continue' }))

describe('OnboardingDialog', () => {
  beforeEach(() => navigate.mockReset())

  it('opens on the welcome step with the progress and the primary button focused', () => {
    renderDialog()

    expect(screen.getByRole('dialog', { name: 'Welcome to Career Workbench' })).toBeTruthy()
    expect(screen.getByText('Step 1 of 5')).toBeTruthy()
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Continue' }))
    expect(screen.queryByRole('button', { name: 'Back' })).toBeNull()
  })

  it('walks the five steps and back', () => {
    renderDialog()

    next()
    expect(screen.getByRole('dialog', { name: 'Start with your resume' })).toBeTruthy()
    next()
    expect(screen.getByRole('dialog', { name: 'Choose your goal' })).toBeTruthy()
    next()
    expect(screen.getByRole('dialog', { name: 'Explore your tools' })).toBeTruthy()
    expect(screen.getByRole('list', { name: 'Tools' }).querySelectorAll('li')).toHaveLength(6)
    next()
    expect(screen.getByRole('dialog', { name: "You're all set!" })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Get started' })).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'Back' }))
    expect(screen.getByRole('dialog', { name: 'Explore your tools' })).toBeTruthy()
  })

  it('recommends and opens the tool that fits the chosen goal', () => {
    const { onComplete } = renderDialog()
    next()
    next()
    fireEvent.click(screen.getByRole('radio', { name: /Interview preparation/ }))
    next()
    next()

    expect(screen.getByText(/starting with Interview Q&A/)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Get started' }))
    expect(onComplete).toHaveBeenCalledTimes(1)
    expect(navigate).toHaveBeenCalledWith({ to: '/interview' })
  })

  it('starts with the Resume Analyzer when no goal was chosen', () => {
    renderDialog()
    for (let i = 0; i < 4; i += 1) next()

    expect(screen.getByText(/starting with Resume Analyzer/)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Get started' }))
    expect(navigate).toHaveBeenCalledWith({ to: '/resume' })
  })

  it('skips from any step', () => {
    const { onSkip } = renderDialog()
    next()
    fireEvent.click(screen.getByRole('button', { name: 'Skip tour' }))

    expect(onSkip).toHaveBeenCalledTimes(1)
  })

  it('offers no skip on the last step, where there is nothing left to skip: its corner X just closes', () => {
    const { onSkip } = renderDialog()
    for (let i = 0; i < 4; i += 1) next()

    expect(screen.queryByRole('button', { name: 'Skip tour' })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Close' }))
    expect(onSkip).toHaveBeenCalledTimes(1)
  })

  it('counts closing it with Esc as a skip, so a replay never leaves the dashboard tour armed', () => {
    const { onSkip } = renderDialog()
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' })

    expect(onSkip).toHaveBeenCalledTimes(1)
  })

  it('stays anchored near the top while its steps change height, and says plainly what it accepts', () => {
    renderDialog()
    expect(screen.getByRole('dialog').getAttribute('data-placement')).toBe('top')
    expect(screen.queryByText(/AI-powered|unlock/i)).toBeNull()
    next()
    expect(screen.getByText(/PDF or DOCX/)).toBeTruthy()
    expect(screen.queryByText(/unlock/i)).toBeNull()
    next()
    next()
    expect(screen.queryByText(/AI-powered/i)).toBeNull()
  })

  // Sign-off r4 chrome-F09: every step has one height on a phone (so Continue stays put); the welcome and the last
  // step had no body and showed about 300px of empty white there. They now say what you get and where you start.
  it('gives the welcome and the last step a body: what you get, and the tool you start with', () => {
    renderDialog()
    const welcome = screen.getByRole('list', { name: 'What you get' })
    expect(welcome.querySelectorAll('li')).toHaveLength(3)
    expect(welcome.textContent).toMatch(/resume/i)

    for (let i = 0; i < 4; i += 1) next()
    const start = screen.getByRole('list', { name: 'Where you start' })
    expect(start.textContent).toContain('Resume Analyzer')
    expect(screen.getByText(/replay this tour from Settings/i)).toBeTruthy()
  })

  it('starts from the welcome again when it is replayed', () => {
    const { rerender, ui } = renderDialog()
    next()
    next()
    expect(screen.getByRole('dialog', { name: 'Choose your goal' })).toBeTruthy()

    rerender(ui(false))
    rerender(ui(true))
    expect(screen.getByRole('dialog', { name: 'Welcome to Career Workbench' })).toBeTruthy()
  })
})

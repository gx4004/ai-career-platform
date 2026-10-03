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

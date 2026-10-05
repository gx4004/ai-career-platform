import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { OnboardingTour } from '#/components/onboarding/OnboardingTour'

function Page({ targets }: { targets: string[] }) {
  return (
    <div>
      <button type="button">Before the tour</button>
      {targets.map((target) => (
        <section key={target} data-tour={target}>
          {target}
        </section>
      ))}
    </div>
  )
}

function renderTour(targets: string[], open = true) {
  const onComplete = vi.fn()
  const onSkip = vi.fn()
  const view = render(
    <>
      <Page targets={targets} />
      <OnboardingTour open={open} onComplete={onComplete} onSkip={onSkip} />
    </>,
  )
  return { ...view, onComplete, onSkip }
}

describe('OnboardingTour', () => {
  beforeEach(() => {
    Element.prototype.scrollIntoView = vi.fn()
  })

  it('walks through every step whose target is on the page, with the original copy', () => {
    const { onComplete } = renderTour(['hero-cta', 'quick-start', 'activity'])

    expect(screen.getByText('1 of 3')).toBeTruthy()
    expect(screen.getByRole('heading', { name: 'Start here' })).toBeTruthy()
    expect(screen.getByText(/Upload your resume to begin the workflow/)).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'Next' }))
    expect(screen.getByRole('heading', { name: 'Your pipeline' })).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'Next' }))
    expect(screen.getByRole('heading', { name: 'Your activity' })).toBeTruthy()
    expect(onComplete).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole('button', { name: 'Got it' }))
    expect(onComplete).toHaveBeenCalledTimes(1)
  })

  it('leaves out a step whose target is missing, so a user with a CV still gets the tour', () => {
    renderTour(['quick-start', 'activity'])

    expect(screen.getByText('1 of 2')).toBeTruthy()
    expect(screen.getByRole('heading', { name: 'Your pipeline' })).toBeTruthy()
    expect(screen.queryByRole('heading', { name: 'Start here' })).toBeNull()
  })

  it('shows nothing when no target is on the page, and nothing while closed', () => {
    const { unmount } = renderTour([])
    expect(screen.queryByRole('dialog')).toBeNull()
    unmount()

    renderTour(['activity'], false)
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('names the dialog by its step and leaves focus where the user had it', () => {
    renderTour(['quick-start', 'activity'])

    expect(screen.getByRole('dialog', { name: 'Tour, step 1 of 2' })).toBeTruthy()
    expect(document.activeElement).toBe(document.body)
  })

  it('is one spotlight: a single ring around the current target, and no second primary button', () => {
    const { baseElement } = renderTour(['quick-start', 'activity'])
    expect(baseElement.querySelectorAll('.app-tour__ring')).toHaveLength(1)
    expect(screen.getByRole('button', { name: 'Next' }).className).toContain('kit-button--secondary')
  })

  it('does not scroll a target that is already in view (it would move where Tab starts)', () => {
    renderTour(['quick-start'])
    expect(Element.prototype.scrollIntoView).not.toHaveBeenCalled()
  })

  it('skips on Escape and from the close button', () => {
    const { onSkip } = renderTour(['quick-start', 'activity'])

    fireEvent.keyDown(window, { key: 'Escape' })
    expect(onSkip).toHaveBeenCalledTimes(1)
    fireEvent.click(screen.getByRole('button', { name: 'Skip tour' }))
    expect(onSkip).toHaveBeenCalledTimes(2)
    fireEvent.click(screen.getByRole('button', { name: 'Skip' }))
    expect(onSkip).toHaveBeenCalledTimes(3)
    fireEvent.click(screen.getByRole('button', { name: 'Next' }))
    expect(screen.queryByRole('button', { name: 'Skip' })).toBeNull()
  })
})

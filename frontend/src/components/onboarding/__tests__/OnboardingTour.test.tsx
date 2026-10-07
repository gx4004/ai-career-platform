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

  it('tells a guest to sign in but a signed-in user where their runs are', () => {
    const { unmount } = renderTour(['activity'])
    expect(screen.getByText(/Sign in to keep your workspace/)).toBeTruthy()
    unmount()

    render(
      <>
        <Page targets={['activity']} />
        <OnboardingTour open signedIn onComplete={vi.fn()} onSkip={vi.fn()} />
      </>,
    )
    // The ring covers Recent activity only, so the copy no longer promises starred results there.
    expect(screen.getByText(/Your recent runs land here/)).toBeTruthy()
    expect(screen.queryByText(/Sign in/)).toBeNull()
  })

  it('leaves out a step whose target is missing, so a user with a CV still gets the tour', () => {
    renderTour(['quick-start', 'activity'])

    expect(screen.getByText('1 of 2')).toBeTruthy()
    expect(screen.getByRole('heading', { name: 'Your pipeline' })).toBeTruthy()
    expect(screen.queryByRole('heading', { name: 'Start here' })).toBeNull()
  })

  it('counts and visits only the targets on the page when each step comes up, not when the tour opened', () => {
    // A newcomer's Recent activity is on the page while it loads, then hides itself once it comes back empty.
    const onComplete = vi.fn()
    const tour = <OnboardingTour open onComplete={onComplete} onSkip={vi.fn()} />
    const { rerender } = render(
      <>
        <Page targets={['hero-cta', 'quick-start', 'activity']} />
        {tour}
      </>,
    )
    expect(screen.getByText('1 of 3')).toBeTruthy()

    rerender(
      <>
        <Page targets={['hero-cta', 'quick-start']} />
        {tour}
      </>,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Next' }))
    expect(screen.getByRole('heading', { name: 'Your pipeline' })).toBeTruthy()
    expect(screen.getByText('2 of 2')).toBeTruthy()
    // The pipeline is now the last step: no "Your activity" step pointing at a section that is gone.
    fireEvent.click(screen.getByRole('button', { name: 'Got it' }))
    expect(onComplete).toHaveBeenCalledTimes(1)
    expect(screen.queryByRole('heading', { name: 'Your activity' })).toBeNull()
  })

  it('moves on when the target of the current step leaves the page, instead of ringing where it was', () => {
    const tour = <OnboardingTour open onComplete={vi.fn()} onSkip={vi.fn()} />
    const { rerender } = render(
      <>
        <Page targets={['hero-cta', 'quick-start', 'activity']} />
        {tour}
      </>,
    )
    expect(screen.getByRole('heading', { name: 'Start here' })).toBeTruthy()

    rerender(
      <>
        <Page targets={['quick-start', 'activity']} />
        {tour}
      </>,
    )
    fireEvent(window, new Event('resize'))
    expect(screen.getByRole('heading', { name: 'Your pipeline' })).toBeTruthy()
    expect(screen.getByText('1 of 2')).toBeTruthy()
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

  it('scrolls a target below the fold up far enough that its ring and a margin are on screen, not flush with the edge', () => {
    const scrollBy = vi.spyOn(window, 'scrollBy').mockImplementation(() => {})
    const original = Element.prototype.getBoundingClientRect
    Element.prototype.getBoundingClientRect = function (this: Element) {
      if (this.matches('[data-tour="quick-start"]')) {
        // 600 to 800 in a 768px window: 32px cut off, plus the 12px ring and a 12px margin = 56px.
        return { top: 600, bottom: 800, height: 200, left: 100, right: 500, width: 400, x: 100, y: 600, toJSON: () => ({}) } as DOMRect
      }
      return original.call(this)
    }
    const height = window.innerHeight
    window.innerHeight = 768
    try {
      renderTour(['quick-start'])
      expect(scrollBy).toHaveBeenCalledWith(0, 56)
      expect(Element.prototype.scrollIntoView).not.toHaveBeenCalled()
    } finally {
      Element.prototype.getBoundingClientRect = original
      window.innerHeight = height
      scrollBy.mockRestore()
    }
  })

  it('says the reply rate comes once you apply when the pipeline has none yet', () => {
    const { unmount } = renderTour(['quick-start'])
    expect(screen.getByText(/The reply rate appears once you apply/)).toBeTruthy()
    unmount()

    render(
      <>
        <section data-tour="quick-start">
          <div className="dash-reply">Reply rate</div>
        </section>
        <OnboardingTour open signedIn onComplete={vi.fn()} onSkip={vi.fn()} />
      </>,
    )
    expect(screen.getByText(/with your reply rate/)).toBeTruthy()
  })

  // Sign-off r4 chrome-F08: the tour also runs on touch tablets, where "⌘K" is a key nobody has; Search is the way in.
  it('names the shortcut on a keyboard device and the Search button on a touch screen', () => {
    const { unmount } = renderTour(['quick-start'])
    expect(screen.getByText(/jumps anywhere/).querySelector('kbd')).toBeTruthy()
    unmount()

    const original = window.matchMedia
    window.matchMedia = ((query: string) => ({ ...original(query), matches: query === '(pointer: coarse)' })) as typeof window.matchMedia
    try {
      renderTour(['quick-start'])
      const body = screen.getByText(/jumps anywhere/)
      expect(body.textContent).toContain('and Search at the top jumps anywhere.')
      expect(body.querySelector('kbd')).toBeNull()
      expect(body.textContent).not.toContain('⌘K')
    } finally {
      window.matchMedia = original
    }
  })

  // Found in sign-off r4 (chrome): Esc that closed the ⌘K palette opened over the tour also skipped the tour. A
  // dialog's Esc is already handled (Radix marks it defaultPrevented); the tour skips only on an Esc of its own.
  it('leaves the tour up when Esc closed something else first', () => {
    const { onSkip } = renderTour(['quick-start'])
    const handled = new KeyboardEvent('keydown', { key: 'Escape', cancelable: true })
    handled.preventDefault()
    window.dispatchEvent(handled)
    expect(onSkip).not.toHaveBeenCalled()
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

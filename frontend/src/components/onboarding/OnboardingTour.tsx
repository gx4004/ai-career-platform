import { useState, useEffect, useLayoutEffect, useCallback, useRef } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'
import { Button, Kbd } from '#/components/kit'

type TourStep = {
  target: string
  title: string
  body: string
  /** What a signed-in user reads instead (the guest copy talks about signing in). */
  signedInBody?: string
}

const STEPS: TourStep[] = [
  {
    target: '[data-tour="hero-cta"]',
    title: 'Start here',
    body: 'Upload your resume to begin the workflow — every tool builds on this first step.',
  },
  {
    target: '[data-tour="quick-start"]',
    title: 'Your pipeline',
    body: 'Every application by stage, with your reply rate. The six tools live in the sidebar, and ⌘K jumps anywhere.',
  },
  {
    target: '[data-tour="activity"]',
    title: 'Your activity',
    body: 'Recent runs and starred results appear here. Sign in to keep your workspace.',
    signedInBody: 'Your recent runs and starred results land here; open one to pick up where you left off.',
  },
]

const CARD_WIDTH = 320
const GAP = 12

function getCardPosition(rect: DOMRect, cardHeight: number) {
  const fitsBelow = rect.bottom + GAP + cardHeight < window.innerHeight
  const top = fitsBelow ? rect.bottom + GAP : Math.max(GAP, rect.top - GAP - cardHeight)
  const left = Math.min(Math.max(16, rect.left), window.innerWidth - CARD_WIDTH - 16)
  return { top, left }
}

/**
 * A short first-run tour of the dashboard. A step whose target is not on the page is left out
 * (a user who already has a CV has no upload row), so the tour only ever points at what is there.
 * It is not modal and does not take focus (the page stays usable from the keyboard, and the skip link stays
 * the first stop of the first Tab); Escape skips it, and the card is the last thing in the tab order.
 */
export function OnboardingTour({
  open,
  signedIn = false,
  onComplete,
  onSkip,
}: {
  open: boolean
  signedIn?: boolean
  onComplete: () => void
  onSkip: () => void
}) {
  const [steps, setSteps] = useState<TourStep[]>([])
  const [step, setStep] = useState(0)
  const [rect, setRect] = useState<DOMRect | null>(null)
  const cardRef = useRef<HTMLDivElement | null>(null)
  const [cardHeight, setCardHeight] = useState(160)
  const current = steps[step]

  useEffect(() => {
    if (!open) {
      setSteps([])
      setStep(0)
      setRect(null)
      return
    }
    setSteps(
      STEPS.filter((candidate) => document.querySelector(candidate.target)).map((candidate) =>
        signedIn && candidate.signedInBody ? { ...candidate, body: candidate.signedInBody } : candidate,
      ),
    )
  }, [open, signedIn])

  const measure = useCallback(() => {
    if (!current) return
    const element = document.querySelector(current.target)
    if (element) setRect(element.getBoundingClientRect())
  }, [current])

  useEffect(() => {
    if (!open || !current) return
    const element = document.querySelector(current.target)
    // Only when it is out of view: scrolling an element into view also moves where the next Tab starts from,
    // which would skip the skip link and the sidebar for a keyboard user.
    if (element) {
      const box = element.getBoundingClientRect()
      if (box.top < 0 || box.bottom > window.innerHeight) element.scrollIntoView({ block: 'nearest' })
    }
    measure()
    window.addEventListener('resize', measure)
    window.addEventListener('scroll', measure, true)
    const observer = element ? new ResizeObserver(measure) : null
    if (element) observer?.observe(element)
    return () => {
      window.removeEventListener('resize', measure)
      window.removeEventListener('scroll', measure, true)
      observer?.disconnect()
    }
  }, [open, current, measure])

  const visible = open && Boolean(current) && rect !== null

  useEffect(() => {
    if (!visible) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onSkip()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [visible, onSkip])

  // The card is placed from its real height, so it sits the same distance from the ring above or below.
  useLayoutEffect(() => {
    if (cardRef.current) setCardHeight(cardRef.current.offsetHeight)
  })

  const next = () => {
    if (step < steps.length - 1) setStep(step + 1)
    else onComplete()
  }

  if (!visible || !current || !rect) return null

  const position = getCardPosition(rect, cardHeight)
  const isLast = step === steps.length - 1

  return createPortal(
    <>
      <div
        className="app-tour__ring"
        aria-hidden="true"
        style={{ top: rect.top - 6, left: rect.left - 6, width: rect.width + 12, height: rect.height + 12 }}
      />
      <div
        ref={cardRef}
        className="app-tour__card"
        role="dialog"
        aria-label={`Tour, step ${step + 1} of ${steps.length}`}
        style={position}
      >
        <div className="app-tour__top">
          <span className="app-tour__count">
            {step + 1} of {steps.length}
          </span>
          <Button type="button" iconOnly variant="ghost" size="sm" aria-label="Skip tour" onClick={onSkip}>
            <X aria-hidden />
          </Button>
        </div>
        <h2 className="app-tour__title">{current.title}</h2>
        <p className="app-tour__body">
          {/* Shortcuts render as keys, so the symbol comes from the system face, not a font subset. */}
          {current.body.split('⌘K').flatMap((part, index) => (index === 0 ? [part] : [<Kbd key={index}>⌘K</Kbd>, part]))}
        </p>
        <div className="app-tour__footer">
          {isLast ? null : (
            <Button type="button" variant="ghost" size="sm" onClick={onSkip}>
              Skip
            </Button>
          )}
          <Button type="button" variant="secondary" size="sm" onClick={next}>
            {isLast ? 'Got it' : 'Next'}
          </Button>
        </div>
      </div>
    </>,
    document.body,
  )
}

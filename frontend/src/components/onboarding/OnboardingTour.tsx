import { useState, useEffect, useLayoutEffect, useCallback, useRef } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'
import { Button, Kbd } from '#/components/kit'
import { useCoarsePointer } from '#/hooks/use-coarse-pointer'
import { useShortcutLabel } from '#/hooks/use-mod-key'

type TourStep = {
  target: string
  title: string
  /** The copy, or the copy for what the target holds right now (a pipeline with or without a reply rate). */
  body: string | ((target: Element) => string)
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
    // Honest for a newcomer too: their pipeline is all zeros and has no reply-rate footer yet.
    body: (target) =>
      `${
        target.querySelector('.dash-reply')
          ? 'Your applications by stage, with your reply rate.'
          : 'Your applications by stage. The reply rate appears once you apply.'
      } The six tools live in the sidebar, and ⌘K jumps anywhere.`,
  },
  {
    target: '[data-tour="activity"]',
    title: 'Your activity',
    body: 'Recent runs and starred results appear here. Sign in to keep your workspace.',
    // The ring covers Recent activity only (Starred results is its own section below).
    signedInBody: 'Your recent runs land here; open one to pick up where you left off.',
  },
]

const CARD_WIDTH = 320
const GAP = 12
/** Clear space between the target and the ring, so a heading at the target's edge never touches the ink. */
const RING_PAD = 12

/**
 * How far to scroll the window so the ring (the target plus RING_PAD) and a GAP of margin are on screen: 0 when
 * they already are. A ring taller than the window keeps its top in view.
 */
function scrollNeeded(box: DOMRect) {
  const top = box.top - RING_PAD - GAP
  const bottom = box.bottom + RING_PAD + GAP
  if (top >= 0 && bottom <= window.innerHeight) return 0
  const down = bottom > window.innerHeight ? bottom - window.innerHeight : 0
  return top - down < 0 ? top : down
}

function getCardPosition(rect: DOMRect, cardHeight: number) {
  const fitsBelow = rect.bottom + RING_PAD + GAP + cardHeight < window.innerHeight
  const top = fitsBelow ? rect.bottom + RING_PAD + GAP : Math.max(GAP, rect.top - RING_PAD - GAP - cardHeight)
  const left = Math.min(Math.max(16, rect.left), window.innerWidth - CARD_WIDTH - 16)
  return { top, left }
}

/** The steps whose target is on the page right now, by their index in STEPS. */
function presentSteps() {
  return STEPS.flatMap((candidate, index) => (document.querySelector(candidate.target) ? [index] : []))
}

/** Where the current step stands, read from the page each time it is measured. */
type Spot = { rect: DOMRect; body: string; position: number; total: number }

/**
 * A short first-run tour of the dashboard. A step whose target is not on the page is left out
 * (a user who already has a CV has no upload row), so the tour only ever points at what is there.
 * The page is read again whenever a step comes up or is measured, not once at the start: a section that
 * hides itself once it loads empty (a newcomer's Recent activity) is skipped and no longer counted, and the
 * ring never stays where a target used to be.
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
  /** The current step, as its index in STEPS; null when nothing is shown. */
  const [index, setIndex] = useState<number | null>(null)
  const [spot, setSpot] = useState<Spot | null>(null)
  const cardRef = useRef<HTMLDivElement | null>(null)
  const [cardHeight, setCardHeight] = useState(160)
  const searchShortcut = useShortcutLabel('K')
  // A touch tablet runs the tour too, usually with no keyboard: the way in there is the Search button atop the rail.
  const coarse = useCoarsePointer()
  const onCompleteRef = useRef(onComplete)
  useLayoutEffect(() => {
    onCompleteRef.current = onComplete
  })
  const current = index === null ? null : STEPS[index]

  useLayoutEffect(() => {
    setSpot(null)
    setIndex(open ? (presentSteps()[0] ?? null) : null)
  }, [open])

  const measure = useCallback(() => {
    if (index === null) return
    const present = presentSteps()
    const element = document.querySelector(STEPS[index].target)
    if (!element) {
      // Its target left the page: go on to the next step that is there, or finish.
      const following = present.find((candidate) => candidate > index)
      if (following === undefined) onCompleteRef.current()
      else setIndex(following)
      return
    }
    const step = STEPS[index]
    const copy = signedIn && step.signedInBody ? step.signedInBody : step.body
    setSpot({
      rect: element.getBoundingClientRect(),
      body: typeof copy === 'function' ? copy(element) : copy,
      position: present.indexOf(index) + 1,
      total: present.length,
    })
  }, [index, signedIn])

  // A layout effect, so a new step never paints for a frame with the previous step's ring.
  useLayoutEffect(() => {
    if (!open || index === null) return
    const element = document.querySelector(STEPS[index].target)
    // Only when its ring is out of view, and by scrolling the window (scrollIntoView would also move where the next
    // Tab starts from, skipping the skip link and the sidebar for a keyboard user). The ring sits RING_PAD outside
    // the target, so the target alone at the edge would leave the ring cut off.
    if (element) {
      const delta = scrollNeeded(element.getBoundingClientRect())
      if (delta !== 0) window.scrollBy(0, delta)
    }
    measure()
    window.addEventListener('resize', measure)
    window.addEventListener('scroll', measure, true)
    // Also fires when the target is removed from the page, so the tour moves on.
    const observer = element ? new ResizeObserver(measure) : null
    if (element) observer?.observe(element)
    return () => {
      window.removeEventListener('resize', measure)
      window.removeEventListener('scroll', measure, true)
      observer?.disconnect()
    }
  }, [open, index, measure])

  const visible = open && current !== null && spot !== null

  useEffect(() => {
    if (!visible) return
    const onKeyDown = (event: KeyboardEvent) => {
      // An Esc a dialog or menu already handled (Radix marks it defaultPrevented) closed that, not the tour.
      if (event.key === 'Escape' && !event.defaultPrevented) onSkip()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [visible, onSkip])

  // The card is placed from its real height, so it sits the same distance from the ring above or below.
  useLayoutEffect(() => {
    if (cardRef.current) setCardHeight(cardRef.current.offsetHeight)
  })

  const next = () => {
    if (index === null) return
    // The next step whose target is on the page now (one may have hidden itself since the tour opened).
    const following = presentSteps().find((candidate) => candidate > index)
    if (following === undefined) onComplete()
    else setIndex(following)
  }

  if (!visible || !current || !spot) return null

  const { rect, body, position: step, total } = spot
  const position = getCardPosition(rect, cardHeight)
  const isLast = step === total

  return createPortal(
    <>
      <div
        className="app-tour__ring"
        aria-hidden="true"
        style={{ top: rect.top - RING_PAD, left: rect.left - RING_PAD, width: rect.width + RING_PAD * 2, height: rect.height + RING_PAD * 2 }}
      />
      <div
        ref={cardRef}
        className="app-tour__card"
        role="dialog"
        aria-label={`Tour, step ${step} of ${total}`}
        style={position}
      >
        <div className="app-tour__top">
          <span className="app-tour__count">
            {step} of {total}
          </span>
          <Button type="button" iconOnly variant="ghost" size="sm" aria-label="Skip tour" onClick={onSkip}>
            <X aria-hidden />
          </Button>
        </div>
        <h2 className="app-tour__title">{current.title}</h2>
        <p className="app-tour__body">
          {/* Shortcuts render as keys, so the symbol comes from the system face, not a font subset. */}
          {coarse
            ? body.replace('⌘K jumps anywhere', 'Search at the top jumps anywhere')
            : body.split('⌘K').flatMap((part, index) => (index === 0 ? [part] : [<Kbd key={index}>{searchShortcut}</Kbd>, part]))}
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

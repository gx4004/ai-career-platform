import { useState } from 'react'
import type { RefObject } from 'react'
import { CircleHelp } from 'lucide-react'
import { Button, Popover, PopoverAnchor, PopoverContent, PopoverTrigger } from '#/components/kit'
import type { ToolId } from '#/lib/tools/registry'

const SCORE_EXPLANATIONS: Record<string, string> = {
  resume: 'This score reflects the quality of the resume itself: sections, quantified achievements, clarity and completeness. If you added a job description, role fit is shown separately under the breakdown.',
  'job-match': 'This score measures how well your resume matches the specific job requirements — keyword overlap, qualification coverage, and evidence alignment.',
  career: 'This score estimates your fit for the recommended direction from the skills and experience in your resume. The other paths have their own fit below.',
}

type Padding = { top: number; right: number; bottom: number; left: number }

/** Room the explanation needs under its anchor (about six lines of body text in the 16px-padded panel). */
const NEEDED = 220
const GAP = 16

/**
 * What the popover must keep clear of, measured when it opens: the page's own column (not the sidebar or the
 * tablet rail), the sticky jump nav (under the phone app bar) at the top and the phone tab tray at the bottom.
 */
function measurePadding(anchor: Element | null): Padding {
  const main = anchor?.closest('main') ?? document.querySelector('main')
  const left = Math.max(GAP, Math.round((main?.getBoundingClientRect().left ?? 0) + GAP))
  const jump = document.querySelector<HTMLElement>('.kit-jump-nav[data-sticky="true"]')
  const stuckTop = jump ? (Number.parseFloat(getComputedStyle(jump).top) || 0) + jump.offsetHeight : 0
  const tray = document.querySelector('.app-tabbar')
  const trayTop = tray && getComputedStyle(tray).display !== 'none' ? tray.getBoundingClientRect().top : window.innerHeight
  return { top: Math.round(stuckTop + GAP / 2), right: GAP, bottom: Math.round(window.innerHeight - trayTop + GAP / 2), left }
}

/**
 * A tap-reachable explanation of the headline score (a tooltip would not open on touch). With `anchorRef` (the
 * verdict row under the seal) it opens below that row, centred, so it never covers the number it explains; when the
 * row sits too low for it (a phone, a short laptop screen), the page first scrolls up just enough to make room.
 */
export function ScoreHelp({ toolId, anchorRef }: { toolId: ToolId; anchorRef?: RefObject<HTMLElement | null> }) {
  const [open, setOpen] = useState(false)
  const [padding, setPadding] = useState<Padding | number>(GAP)
  const explanation = SCORE_EXPLANATIONS[toolId]
  if (!explanation) return null

  function handleOpenChange(next: boolean) {
    if (next && anchorRef?.current) {
      const room = measurePadding(anchorRef.current)
      setPadding(room)
      const box = anchorRef.current.getBoundingClientRect()
      const short = box.bottom + 6 + NEEDED - (window.innerHeight - room.bottom)
      // Never so far that the anchor itself goes under the sticky bars.
      const by = Math.min(short, box.top - room.top)
      if (by > 0) {
        const reduced = typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
        window.scrollBy({ top: by, behavior: reduced ? 'auto' : 'smooth' })
      }
    }
    setOpen(next)
  }

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
        {/* md: a 44px target with the 16px icon (sm draws it at 14). */}
        <Button iconOnly variant="ghost" size="md" aria-label="What does this score mean?">
          <CircleHelp aria-hidden="true" />
        </Button>
      </PopoverTrigger>
      {/* After the trigger: on mount the trigger registers itself as the anchor first, and this one must win. */}
      {anchorRef ? <PopoverAnchor virtualRef={anchorRef as RefObject<HTMLElement>} /> : null}
      <PopoverContent side="bottom" align={anchorRef ? 'center' : 'end'} collisionPadding={padding}>
        <p className="result-prose">{explanation}</p>
      </PopoverContent>
    </Popover>
  )
}

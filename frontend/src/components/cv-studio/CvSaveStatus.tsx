import { useEffect, useState } from 'react'
import { Check, TriangleAlert } from 'lucide-react'
import { Button, Tooltip } from '#/components/kit'
import type { SaveState } from './useCvDraft'

const NOW_TICK_MS = 30_000
const dayFormat = new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short' })
const clockFormat = new Intl.DateTimeFormat(undefined, { hour: '2-digit', minute: '2-digit' })
const dayClockFormat = new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
/** The clock time, with the day when it is not today. */
const when = (at: number) => (new Date(at).toDateString() === new Date().toDateString() ? clockFormat : dayClockFormat).format(at)

/** "just now", "2 min ago", "3 h ago", "on 12 Jul": what the bar says after "Saved". */
export function savedAgo(savedAt: number, now: number) {
  const seconds = Math.max(0, Math.round((now - savedAt) / 1000))
  if (seconds < 45) return 'just now'
  const minutes = Math.round(seconds / 60)
  if (minutes < 60) return `${minutes} min ago`
  const hours = Math.round(minutes / 60)
  if (hours < 24) return `${hours} h ago`
  return `on ${dayFormat.format(savedAt)}`
}

function useNow() {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), NOW_TICK_MS)
    return () => window.clearInterval(timer)
  }, [])
  return now
}

/**
 * The studio's save state in the top bar: a disc and a word (never colour alone).
 * Saved says when ("Saved 2 min ago"), and a tooltip adds the exact time and when the server copy was last checked.
 */
export function CvSaveStatus({ state, savedAt, checkedAt, onRetry }: {
  state: SaveState
  /** When the server copy was last written, in ms. */
  savedAt: number | null
  /** When this tab last asked the server whether a newer copy exists. */
  checkedAt: number | null
  onRetry: () => void
}) {
  const now = useNow()
  const kind = state === 'idle' ? 'saved' : state
  const detail = [
    savedAt ? `Last saved ${when(savedAt)}.` : null,
    checkedAt ? `Checked for newer versions at ${when(checkedAt)}.` : 'Checked for newer versions when you opened it.',
  ].filter(Boolean).join(' ')

  const disc = kind === 'saving'
    ? <span className="cvs-save__disc cvs-save__disc--spin" aria-hidden="true" />
    : kind === 'error' || kind === 'conflict'
      ? <span className="cvs-save__disc" aria-hidden="true"><TriangleAlert /></span>
      : <span className="cvs-save__disc" aria-hidden="true"><Check /></span>

  const text = kind === 'saving'
    ? 'Saving…'
    : kind === 'error'
      ? 'Not saved'
      : kind === 'conflict'
        ? 'Newer version elsewhere'
        : savedAt ? `Saved ${savedAgo(savedAt, now)}` : 'Saved'

  const body = (
    <span className="cvs-save" data-state={kind} role="status" aria-live="polite" data-testid="save-status" tabIndex={0}>
      {disc}
      <span className="cvs-save__text">{text}</span>
    </span>
  )
  return (
    <span className="cvs-save-wrap">
      <Tooltip content={detail} side="bottom" align="start">{body}</Tooltip>
      {kind === 'error' ? <Button type="button" variant="link" onClick={onRetry}>Try again</Button> : null}
    </span>
  )
}

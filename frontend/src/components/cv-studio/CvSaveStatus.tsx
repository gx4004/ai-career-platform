import { useEffect, useState } from 'react'
import { Check, LoaderCircle, TriangleAlert } from 'lucide-react'
import { Tooltip } from '#/components/kit'
import type { SaveState } from './useCvDraft'

const NOW_TICK_MS = 30_000
const dayFormat = new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short' })
const clockFormat = new Intl.DateTimeFormat(undefined, { hour: '2-digit', minute: '2-digit' })
const dayClockFormat = new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
/** The clock time, with the day when it is not today. */
const when = (at: number) => (new Date(at).toDateString() === new Date().toDateString() ? clockFormat : dayClockFormat).format(at)

/** "just now", "2 min ago", "3 hours ago", "on 12 Jul": what the bar says after "Saved". */
export function savedAgo(savedAt: number, now: number) {
  const seconds = Math.max(0, Math.round((now - savedAt) / 1000))
  if (seconds < 45) return 'just now'
  const minutes = Math.round(seconds / 60)
  if (minutes < 60) return `${minutes} min ago`
  const hours = Math.round(minutes / 60)
  if (hours < 24) return `${hours} ${hours === 1 ? 'hour' : 'hours'} ago`
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
 * The studio's save state in the top bar: one disc in the state's tone and a word (never colour alone), the same
 * shape in every state so the bar never jumps while it autosaves (STICKER-SYSTEM 4.CV): mint check "Saved", stone
 * spinner "Saving…", rose alert "Not saved", lemon alert "Newer version elsewhere". The notice under the bar holds
 * the action for the last two. Saved says when ("Saved 2 min ago"), and a tooltip adds the exact time and when the
 * server copy was last checked. The studio focuses the status after "Try again" or "Reload newer version", so the
 * tooltip opens on keyboard focus only: a tap there must not leave a bubble over the action row.
 */
export function CvSaveStatus({ state, savedAt, checkedAt }: {
  state: SaveState
  /** When the server copy was last written, in ms. */
  savedAt: number | null
  /** When this tab last asked the server whether a newer copy exists. */
  checkedAt: number | null
}) {
  const now = useNow()
  const kind = state === 'idle' ? 'saved' : state
  const detail = [
    savedAt ? `Last saved ${when(savedAt)}.` : null,
    checkedAt ? `Checked for newer versions at ${when(checkedAt)}.` : 'Checked for newer versions when you opened it.',
  ].filter(Boolean).join(' ')

  const icon = kind === 'saving'
    ? <LoaderCircle className="cvs-save__spin" aria-hidden="true" />
    : kind === 'error' || kind === 'conflict'
      ? <TriangleAlert aria-hidden="true" />
      : <Check aria-hidden="true" />

  const text = kind === 'saved'
    ? <>Saved{savedAt ? <> <span className="cvs-save__ago">{savedAgo(savedAt, now)}</span></> : null}</>
    : kind === 'saving'
      ? 'Saving…'
      : kind === 'error'
        ? 'Not saved'
        : 'Newer version elsewhere'

  return (
    <span className="cvs-save-wrap">
      <Tooltip content={detail} side="bottom" align="start" openOnFocusVisibleOnly>
        <span className="cvs-save" role="status" aria-live="polite" data-testid="save-status" data-state={kind} tabIndex={0}>
          <span className="cvs-save__disc" aria-hidden="true">{icon}</span>
          {text}
        </span>
      </Tooltip>
    </span>
  )
}

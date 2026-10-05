import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from 'react'
import { Check, TriangleAlert, X } from 'lucide-react'
import { Button } from './button'

export type ToastTone = 'neutral' | 'success' | 'danger'

type ToastContent = { title: ReactNode; description?: ReactNode } | { title?: undefined; description: ReactNode }

export type ToastOptions = ToastContent & {
  /** Reuse an id to replace a toast in place (and restart its timer) instead of stacking another. */
  id?: string
  /** success (mint check disc) and danger (rose alert disc) carry their own icon; neutral has none. */
  tone?: ToastTone
  /** Your own icon, or false for none. */
  icon?: ReactNode | false
  /** ms before it closes by itself. Default 5000, or 8000 for a danger toast or one with an action. null: stays until dismissed. */
  duration?: number | null
  /** One quiet action ("Undo"). Running it dismisses the toast. */
  action?: { label: string; onClick: () => void }
  /** Called once when the toast closes, however it closed. */
  onDismiss?: () => void
}

type ToastRecord = {
  id: string
  options: ToastOptions
  open: boolean
  /** Bumped when a toast is replaced, to restart its timer. */
  revision: number
}

type ToastApi = {
  /** Shows a toast and returns its id. */
  toast: (options: ToastOptions) => string
  /** Closes one toast, or every toast when no id is given. */
  dismiss: (id?: string) => void
}

const ToastContext = createContext<ToastApi | null>(null)

/** Time a closing toast stays mounted so its fade can play. */
const EXIT_MS = 160
const DEFAULT_MS = 5000
const LONG_MS = 8000

/** `const { toast, dismiss } = useToast()`. Must be used under <ToastProvider>. */
export function useToast(): ToastApi {
  const api = useContext(ToastContext)
  if (!api) throw new Error('useToast must be used inside <ToastProvider>')
  return api
}

type Announcement = { key: string; content: ReactNode }

let nextId = 0
let announceCount = 0

/**
 * Mount once at the app root, outside anything with a CSS transform. Toasts stack bottom-right on desktop
 * and above the mobile tab bar on phones; a closing toast leaves after a short fade.
 */
export function ToastProvider({ children, max = 3 }: { children: ReactNode; /** Visible at once; the oldest closes first. */ max?: number }) {
  const [records, setRecords] = useState<ToastRecord[]>([])
  // What the persistent live regions are currently saying (screen readers announce a change in a region that already exists).
  const [announced, setAnnounced] = useState<{ polite: Announcement | null; assertive: Announcement | null }>({ polite: null, assertive: null })
  // The ref is the source of truth so several toast() calls in one tick see each other; state mirrors it for rendering.
  const live = useRef<ToastRecord[]>([])
  const exitTimers = useRef(new Map<string, ReturnType<typeof setTimeout>>())

  const commit = useCallback((next: ToastRecord[]) => {
    live.current = next
    setRecords(next)
  }, [])

  useEffect(() => {
    const timers = exitTimers.current
    return () => {
      for (const timer of timers.values()) clearTimeout(timer)
      timers.clear()
    }
  }, [])

  const close = useCallback(
    (ids: string[]) => {
      const closing = live.current.filter((item) => item.open && ids.includes(item.id))
      if (closing.length === 0) return
      commit(live.current.map((item) => (closing.includes(item) ? { ...item, open: false } : item)))
      for (const { id, options } of closing) {
        options.onDismiss?.()
        exitTimers.current.set(
          id,
          setTimeout(() => {
            exitTimers.current.delete(id)
            commit(live.current.filter((item) => item.id !== id || item.open))
          }, EXIT_MS),
        )
      }
    },
    [commit],
  )

  const dismiss = useCallback(
    (id?: string) => close(id === undefined ? live.current.map((item) => item.id) : [id]),
    [close],
  )

  const toast = useCallback(
    (options: ToastOptions) => {
      const id = options.id ?? `kit-toast-${++nextId}`
      const pendingExit = exitTimers.current.get(id)
      if (pendingExit) {
        clearTimeout(pendingExit)
        exitTimers.current.delete(id)
      }

      const existing = live.current.find((item) => item.id === id)
      commit(
        existing
          ? live.current.map((item) => (item.id === id ? { id, options, open: true, revision: item.revision + 1 } : item))
          : [...live.current, { id, options, open: true, revision: 0 }],
      )

      const body = options.title ?? options.description
      const detail = options.title !== undefined ? options.description : undefined
      const level = options.tone === 'danger' ? 'assertive' : 'polite'
      setAnnounced((current) => ({
        ...current,
        [level]: {
          key: `${id}-${++announceCount}`,
          content: (
            <>
              {body}
              {detail ? <> {detail}</> : null}
            </>
          ),
        },
      }))

      const open = live.current.filter((item) => item.open)
      close(open.slice(0, Math.max(0, open.length - max)).map((item) => item.id))
      return id
    },
    [close, commit, max],
  )

  const api = useMemo<ToastApi>(() => ({ toast, dismiss }), [toast, dismiss])

  return (
    <ToastContext.Provider value={api}>
      {children}
      {/* aria-live="off" adds no announcing of its own; its presence is what keeps the region visible to assistive
          tech while a modal dialog hides the rest of the page (aria-hidden skips [aria-live]). The announcing is done
          by the two persistent regions below: text rendered into a live region that already exists is spoken reliably,
          a toast that is inserted already carrying role=status is not. */}
      <div className="kit-toast-region" data-kit-toast-region="" aria-live="off">
        <div className="kit-sr-only" role="status" aria-live="polite" aria-atomic="true" data-kit-toast-announcer="polite">
          {announced.polite ? <span key={announced.polite.key}>{announced.polite.content}</span> : null}
        </div>
        <div className="kit-sr-only" role="alert" aria-live="assertive" aria-atomic="true" data-kit-toast-announcer="assertive">
          {announced.assertive ? <span key={announced.assertive.key}>{announced.assertive.content}</span> : null}
        </div>
        {records.map((record) => (
          <ToastItem key={record.id} record={record} onDismiss={dismiss} />
        ))}
      </div>
    </ToastContext.Provider>
  )
}

function toneIcon(tone: ToastTone) {
  if (tone === 'success') return <Check aria-hidden="true" />
  if (tone === 'danger') return <TriangleAlert aria-hidden="true" />
  return null
}

function ToastItem({ record, onDismiss }: { record: ToastRecord; onDismiss: (id: string) => void }) {
  const { id, options, open, revision } = record
  const tone = options.tone ?? 'neutral'
  const duration = options.duration === undefined ? (tone === 'danger' || options.action ? LONG_MS : DEFAULT_MS) : options.duration

  const [hovered, setHovered] = useState(false)
  const [focused, setFocused] = useState(false)
  const [hidden, setHidden] = useState(() => typeof document !== 'undefined' && document.visibilityState === 'hidden')
  const paused = hovered || focused || hidden

  const remaining = useRef(duration)
  useEffect(() => {
    remaining.current = duration
  }, [duration, revision])

  useEffect(() => {
    const onVisibility = () => setHidden(document.visibilityState === 'hidden')
    document.addEventListener('visibilitychange', onVisibility)
    return () => document.removeEventListener('visibilitychange', onVisibility)
  }, [])

  // The cleanup also runs when the toast is paused, and banks the time already spent.
  useEffect(() => {
    if (!open || duration === null || paused) return
    const startedAt = Date.now()
    const timer = setTimeout(() => onDismiss(id), Math.max(0, remaining.current ?? 0))
    return () => {
      clearTimeout(timer)
      remaining.current = Math.max(0, (remaining.current ?? 0) - (Date.now() - startedAt))
    }
  }, [open, duration, paused, revision, id, onDismiss])

  const icon = options.icon === undefined ? toneIcon(tone) : options.icon
  const primary = options.title ?? options.description
  const secondary = options.title !== undefined ? options.description : undefined

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Escape') {
      event.stopPropagation()
      onDismiss(id)
    }
  }

  return (
    <div
      className="kit-toast"
      data-tone={tone}
      data-state={open ? 'open' : 'closed'}
      onPointerEnter={() => setHovered(true)}
      onPointerLeave={() => setHovered(false)}
      onFocus={() => setFocused(true)}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setFocused(false)
      }}
      onKeyDown={onKeyDown}
    >
      {icon ? <span className="kit-toast__icon">{icon}</span> : null}
      <div className="kit-toast__text">
        <p className="kit-toast__title">{primary}</p>
        {secondary ? <p className="kit-toast__description">{secondary}</p> : null}
      </div>
      {options.action ? (
        <Button
          type="button"
          variant="link"
          size="sm"
          className="kit-toast__action"
          onClick={() => {
            options.action?.onClick()
            onDismiss(id)
          }}
        >
          {options.action.label}
        </Button>
      ) : null}
      <Button
        type="button"
        iconOnly
        variant="ghost"
        size="sm"
        className="kit-toast__close"
        aria-label="Dismiss notification"
        onClick={() => onDismiss(id)}
      >
        <X aria-hidden="true" />
      </Button>
    </div>
  )
}

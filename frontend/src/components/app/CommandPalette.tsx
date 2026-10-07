import { Suspense, lazy, useEffect, useRef, useState } from 'react'
import { ChunkBoundary } from '#/components/app/ChunkBoundary'

/** Event the sidebar's search button dispatches to open the palette. */
export const OPEN_COMMAND_PALETTE_EVENT = 'cw:open-command-palette'

export function openCommandPalette() {
  window.dispatchEvent(new Event(OPEN_COMMAND_PALETTE_EVENT))
}

const loadDialog = () => import('#/components/app/CommandPaletteDialog')
// A fresh lazy() per attempt: React keeps a rejected import, so retrying needs a new one.
const lazyDialog = () => lazy(() => loadDialog().then((module) => ({ default: module.CommandPaletteDialog })))

/** Renders nothing; its effect runs once the lazy dialog beside it in the Suspense boundary has rendered. */
function Loaded({ onLoaded }: { onLoaded: () => void }) {
  useEffect(onLoaded, [onLoaded])
  return null
}

/**
 * ⌘K / Ctrl+K palette. This mount is all every page carries: the shortcut, the open event and the open
 * state. The dialog itself (its lists, queries and icons) is a separate chunk, fetched when the browser is
 * idle after the first load (so the first ⌘K is still instant) or on the first open, whichever comes first.
 */
export function CommandPalette() {
  const [open, setOpen] = useState(false)
  const [mounted, setMounted] = useState(false)
  const [CommandPaletteDialog, setDialog] = useState(() => lazyDialog())
  if (open && !mounted) setMounted(true)
  // Until the dialog's chunk has arrived nothing on the page listens for Esc: this mount closes it then.
  const loaded = useRef(false)
  const [onLoaded] = useState(() => () => {
    loaded.current = true
  })

  // The dialog's chunk failed to load: close quietly, the page stays, and the next ⌘K asks for the file
  // again (Chromium answers from its record of the failed fetch until the page is reloaded).
  const onLoadError = () => {
    loaded.current = false
    setOpen(false)
    setMounted(false)
    setDialog(() => lazyDialog())
  }

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key.toLowerCase() === 'k' && (event.metaKey || event.ctrlKey)) {
        event.preventDefault()
        setOpen((value) => !value)
      } else if (event.key === 'Escape' && !loaded.current) {
        // ⌘K then Esc before the chunk came: the palette stays shut instead of opening a moment later.
        setOpen(false)
      }
    }
    const onOpen = () => setOpen(true)
    window.addEventListener('keydown', onKey)
    window.addEventListener(OPEN_COMMAND_PALETTE_EVENT, onOpen)
    return () => {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener(OPEN_COMMAND_PALETTE_EVENT, onOpen)
    }
  }, [])

  useEffect(() => {
    const warm = () => void loadDialog().catch(() => {})
    if (typeof window.requestIdleCallback === 'function') {
      const handle = window.requestIdleCallback(warm, { timeout: 8000 })
      return () => window.cancelIdleCallback(handle)
    }
    const timer = window.setTimeout(warm, 4000)
    return () => window.clearTimeout(timer)
  }, [])

  if (!mounted) return null
  return (
    <ChunkBoundary onError={onLoadError}>
      <Suspense fallback={null}>
        <CommandPaletteDialog open={open} onOpenChange={setOpen} />
        <Loaded onLoaded={onLoaded} />
      </Suspense>
    </ChunkBoundary>
  )
}

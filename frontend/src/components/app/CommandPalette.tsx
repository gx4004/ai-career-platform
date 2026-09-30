import { useEffect, useMemo, useRef, useState } from 'react'
import type { KeyboardEvent as ReactKeyboardEvent } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import type { LucideIcon } from 'lucide-react'
import {
  CornerDownLeft,
  LayoutDashboard,
  Search,
  Settings,
  ShieldCheck,
  SquareKanban,
  UserRound,
} from 'lucide-react'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '#/components/ui/dialog'
import { useSession } from '#/hooks/useSession'
import { listApplications } from '#/lib/api/client'
import { navGroups } from '#/lib/navigation/navGroups'
import { APPLICATION_BOARD_QUERY_KEY } from '#/lib/query/applicationCaches'
import { toolList } from '#/lib/tools/registry'
import { cn } from '#/lib/utils'

/** Event the sidebar's search button dispatches to open the palette. */
export const OPEN_COMMAND_PALETTE_EVENT = 'cw:open-command-palette'

export function openCommandPalette() {
  window.dispatchEvent(new Event(OPEN_COMMAND_PALETTE_EVENT))
}

type PaletteItem = {
  id: string
  group: string
  label: string
  hint?: string
  icon: LucideIcon
  to: string
  keywords?: string
}

function matches(item: PaletteItem, query: string) {
  if (!query) return true
  const haystack = `${item.label} ${item.hint ?? ''} ${item.keywords ?? ''}`.toLowerCase()
  return query
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .every((word) => haystack.includes(word))
}

/**
 * ⌘K / Ctrl+K palette: jump to any page, tool or application by typing.
 * Built on the Dialog primitive; arrow keys move, Enter opens, Esc closes.
 */
export function CommandPalette() {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [active, setActive] = useState(0)
  const listRef = useRef<HTMLUListElement | null>(null)
  const navigate = useNavigate()
  const { user } = useSession()

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key.toLowerCase() === 'k' && (event.metaKey || event.ctrlKey)) {
        event.preventDefault()
        setOpen((value) => !value)
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
    if (!open) {
      setQuery('')
      setActive(0)
    }
  }, [open])

  const applications = useQuery({
    queryKey: APPLICATION_BOARD_QUERY_KEY,
    queryFn: listApplications,
    enabled: open && Boolean(user),
    staleTime: 30_000,
  })

  const items = useMemo<PaletteItem[]>(() => {
    const pages: PaletteItem[] = [
      { id: 'dashboard', group: 'Go to', label: 'Dashboard', icon: LayoutDashboard, to: '/dashboard', keywords: 'home today' },
    ]
    for (const group of navGroups) {
      if (group.id === 'job-search' && !user) continue
      for (const destination of group.destinations) {
        pages.push({
          id: destination.route,
          group: 'Go to',
          label: destination.label,
          icon: destination.icon,
          to: destination.route,
        })
      }
    }
    pages.push(
      { id: 'account', group: 'Go to', label: 'Account', icon: UserRound, to: '/account' },
      { id: 'settings', group: 'Go to', label: 'Settings', icon: Settings, to: '/settings', keywords: 'preferences' },
    )
    if (user?.is_admin) {
      pages.push({ id: 'admin', group: 'Go to', label: 'Admin', icon: ShieldCheck, to: '/admin' })
    }
    const tools: PaletteItem[] = toolList.map((tool) => ({
      id: `tool-${tool.id}`,
      group: 'Tools',
      label: tool.label,
      icon: tool.icon,
      to: tool.route,
    }))
    const apps: PaletteItem[] = (applications.data?.items ?? []).map((item) => ({
      id: `app-${item.id}`,
      group: 'Applications',
      label: item.title ?? item.label ?? 'Untitled application',
      hint: item.company ?? undefined,
      icon: SquareKanban,
      to: `/campaigns/${item.id}`,
      keywords: item.status,
    }))
    return [...pages, ...tools, ...apps]
  }, [applications.data, user])

  const visible = useMemo(() => items.filter((item) => matches(item, query.trim())), [items, query])

  useEffect(() => {
    setActive(0)
  }, [query])

  useEffect(() => {
    listRef.current
      ?.querySelector<HTMLElement>(`[data-index="${active}"]`)
      ?.scrollIntoView({ block: 'nearest' })
  }, [active])

  const go = (item: PaletteItem | undefined) => {
    if (!item) return
    setOpen(false)
    void navigate({ to: item.to })
  }

  const onKeyDown = (event: ReactKeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      setActive((index) => Math.min(index + 1, visible.length - 1))
    } else if (event.key === 'ArrowUp') {
      event.preventDefault()
      setActive((index) => Math.max(index - 1, 0))
    } else if (event.key === 'Enter') {
      event.preventDefault()
      go(visible[active])
    }
  }

  let lastGroup = ''

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="command-palette" showCloseButton={false}>
        <DialogTitle className="sr-only">Search</DialogTitle>
        <DialogDescription className="sr-only">
          Jump to a page, tool or application. Use the arrow keys and Enter.
        </DialogDescription>
        <div className="command-palette__search">
          <Search size={16} aria-hidden="true" />
          <input
            autoFocus
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={onKeyDown}
            placeholder="Search pages, tools and applications…"
            aria-label="Search"
            role="combobox"
            aria-expanded="true"
            aria-controls="command-palette-list"
            aria-activedescendant={visible[active] ? `command-palette-${visible[active].id}` : undefined}
          />
          <kbd>Esc</kbd>
        </div>
        <ul id="command-palette-list" ref={listRef} className="command-palette__list" role="listbox">
          {visible.length === 0 ? (
            <li className="command-palette__empty">No results for “{query}”</li>
          ) : (
            visible.map((item, index) => {
              const heading = item.group !== lastGroup ? item.group : null
              lastGroup = item.group
              return (
                <li key={item.id} role="presentation">
                  {heading ? <div className="command-palette__group">{heading}</div> : null}
                  <div
                    id={`command-palette-${item.id}`}
                    role="option"
                    aria-selected={index === active}
                    data-index={index}
                    className={cn('command-palette__item', index === active && 'is-active')}
                    onMouseMove={() => setActive(index)}
                    onClick={() => go(item)}
                  >
                    <item.icon size={15} aria-hidden="true" />
                    <span className="command-palette__label">{item.label}</span>
                    {item.hint ? <span className="command-palette__hint">{item.hint}</span> : null}
                    {index === active ? <CornerDownLeft size={13} className="command-palette__enter" aria-hidden="true" /> : null}
                  </div>
                </li>
              )
            })
          )}
        </ul>
      </DialogContent>
    </Dialog>
  )
}

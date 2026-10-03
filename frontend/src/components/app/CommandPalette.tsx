import { useEffect, useId, useMemo, useState } from 'react'
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
  EmptyState,
  Input,
  Kbd,
  Row,
  RowBody,
  RowLeading,
  RowMeta,
  RowTitle,
} from '#/components/kit'
import { useSession } from '#/hooks/useSession'
import { listApplications } from '#/lib/api/client'
import { navGroups } from '#/lib/navigation/navGroups'
import { APPLICATION_BOARD_QUERY_KEY } from '#/lib/query/applicationCaches'
import { toolList } from '#/lib/tools/registry'

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
 * A kit Dialog holding a combobox and a listbox of kit Rows; arrow keys move, Enter opens, Esc closes.
 */
export function CommandPalette() {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [active, setActive] = useState(0)
  // The results element mounts with the dialog's portal, a commit after `open` flips, so it is state, not a plain ref.
  const [listEl, setListEl] = useState<HTMLDivElement | null>(null)
  const [scrollable, setScrollable] = useState(false)
  const navigate = useNavigate()
  const { user } = useSession()
  const listId = useId()

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

  // Consecutive items of one group sit under one heading; `index` is the item's place in the whole list.
  const groups = useMemo(() => {
    const result: Array<{ name: string; entries: Array<{ item: PaletteItem; index: number }> }> = []
    visible.forEach((item, index) => {
      const last = result[result.length - 1]
      if (last && last.name === item.group) last.entries.push({ item, index })
      else result.push({ name: item.group, entries: [{ item, index }] })
    })
    return result
  }, [visible])

  useEffect(() => {
    setActive(0)
  }, [query])

  useEffect(() => {
    listEl?.querySelector<HTMLElement>(`[data-index="${active}"]`)?.scrollIntoView({ block: 'nearest' })
  }, [active, listEl])

  // A list that scrolls must be reachable from the keyboard on its own, as in a Dialog body.
  useEffect(() => {
    if (!listEl) return
    const measure = () => setScrollable(listEl.scrollHeight > listEl.clientHeight + 1)
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(listEl)
    return () => observer.disconnect()
  }, [listEl, visible.length])

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

  const optionId = (item: PaletteItem) => `${listId}-${item.id.replace(/[^a-zA-Z0-9_-]/g, '_')}`

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent size="md" showClose={false} className="app-palette">
        <DialogTitle visuallyHidden>Search</DialogTitle>
        <DialogDescription visuallyHidden>
          Jump to a page, tool or application. Use the arrow keys and Enter.
        </DialogDescription>
        <div className="app-palette__search">
          <Input
            size="lg"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={onKeyDown}
            placeholder="Search"
            aria-label="Search"
            autoComplete="off"
            spellCheck={false}
            role="combobox"
            aria-expanded={visible.length > 0}
            aria-controls={visible.length > 0 ? listId : undefined}
            aria-autocomplete="list"
            aria-activedescendant={visible[active] ? optionId(visible[active]) : undefined}
            leading={<Search aria-hidden />}
            trailing={<Kbd className="app-palette__esc">Esc</Kbd>}
          />
        </div>
        <div ref={setListEl} className="app-palette__results" tabIndex={scrollable ? 0 : undefined}>
          {visible.length === 0 ? (
            <EmptyState
              role="status"
              title={`No results for “${query}”`}
              description="Try a page, tool or application name."
            />
          ) : (
            <div id={listId} role="listbox" aria-label="Results">
              {groups.map((group, groupIndex) => (
                <div
                  key={group.name}
                  role="group"
                  aria-labelledby={`${listId}-group-${groupIndex}`}
                  className="app-palette__group"
                >
                  <div id={`${listId}-group-${groupIndex}`} className="app-palette__heading" role="presentation">
                    {group.name}
                  </div>
                  {group.entries.map(({ item, index }) => (
                    <Row
                      key={item.id}
                      as="div"
                      density="compact"
                      role="option"
                      id={optionId(item)}
                      aria-selected={index === active}
                      selected={index === active}
                      interactive
                      data-index={index}
                      onMouseMove={() => setActive(index)}
                      onClick={() => go(item)}
                    >
                      <RowLeading>
                        <item.icon aria-hidden />
                      </RowLeading>
                      <RowBody>
                        <RowTitle>{item.label}</RowTitle>
                      </RowBody>
                      <RowMeta className="app-palette__meta">
                        {item.hint}
                        {index === active ? <CornerDownLeft aria-hidden /> : null}
                      </RowMeta>
                    </Row>
                  ))}
                </div>
              ))}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}

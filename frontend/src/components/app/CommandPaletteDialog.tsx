import { useEffect, useId, useMemo, useRef, useState } from 'react'
import type { KeyboardEvent as ReactKeyboardEvent } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import type { LucideIcon } from 'lucide-react'
import {
  Briefcase,
  CornerDownLeft,
  LogIn,
  LogOut,
  PanelLeft,
  Search,
  SearchX,
  Settings,
  ShieldCheck,
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
  RowSubtitle,
  RowTitle,
  ToolTile,
} from '#/components/kit'
import type { Tone } from '#/components/kit'
import { useOptionalSidebar } from '#/components/ui/sidebar'
import { useKnownBreakpoint } from '#/hooks/use-breakpoint'
import { shortcutLabel, useModKey } from '#/hooks/use-mod-key'
import { useSession } from '#/hooks/useSession'
import { getHistory, listApplications } from '#/lib/api/client'
import { dashboardDestination, navGroups } from '#/lib/navigation/navGroups'
import { APPLICATION_BOARD_QUERY_KEY } from '#/lib/query/applicationCaches'
import { formatRunDay } from '#/lib/tools/runLabel'
import { historyRunHref, historyToolDisplay } from '#/lib/tools/historyToolLabel'
import { toolList } from '#/lib/tools/registry'

/** A result either opens a page (`to`) or does something (`run`, the Actions group). */
type PaletteItem = {
  id: string
  group: string
  label: string
  hint?: string
  /** A keyboard shortcut ("⌘B"), shown after the hint and hidden on touch screens (styles/shell.css). */
  shortcut?: string
  icon: LucideIcon
  /** Tools show their colour tile instead of a bare icon. */
  tone?: Tone
  to?: string
  run?: () => void
  keywords?: string
}

const RECENT_RUNS_QUERY_KEY = ['command-palette', 'recent-runs'] as const

/** What each destination holds, in the words people search with ("runs" is History, "pipeline" is Applications). */
const DESTINATION_KEYWORDS: Record<string, string> = {
  '/discovery': 'jobs openings listings matches find',
  '/campaigns': 'jobs pipeline campaigns applied interviews',
  '/cv-studio': 'resume cv editor document templates',
  '/profile': 'evidence facts skills experience',
  '/history': 'runs results saved past',
}

const wordsOf = (text: string) => text.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean)

/**
 * How well an item matches the query, 0 for no match. Word starts beat inner substrings, so "cover"
 * ranks Cover Letter above dis-cover-y: exact label 5, label prefix 4, every word starts a label word 3,
 * every word starts any searchable word 2, every word appears somewhere 1.
 */
function score(item: PaletteItem, query: string) {
  const terms = wordsOf(query)
  if (terms.length === 0) return 1
  const label = item.label.toLowerCase()
  const haystack = `${item.label} ${item.hint ?? ''} ${item.keywords ?? ''}`.toLowerCase()
  if (!terms.every((term) => haystack.includes(term))) return 0
  const phrase = terms.join(' ')
  if (wordsOf(label).join(' ') === phrase) return 5
  if (wordsOf(label).join(' ').startsWith(phrase)) return 4
  const startsWord = (words: string[]) => terms.every((term) => words.some((word) => word.startsWith(term)))
  if (startsWord(wordsOf(label))) return 3
  if (startsWord(wordsOf(haystack))) return 2
  return 1
}

/** Matching items, best first. Groups stay together and move up by their best item; ties keep list order. */
function rank(items: PaletteItem[], query: string) {
  const scored = items.map((item, index) => ({ item, index, score: score(item, query) })).filter((entry) => entry.score > 0)
  const best = new Map<string, number>()
  const firstAt = new Map<string, number>()
  for (const entry of scored) {
    best.set(entry.item.group, Math.max(best.get(entry.item.group) ?? 0, entry.score))
    if (!firstAt.has(entry.item.group)) firstAt.set(entry.item.group, entry.index)
  }
  return scored
    .sort((a, b) => {
      const ga = a.item.group
      const gb = b.item.group
      if (ga !== gb) return best.get(gb)! - best.get(ga)! || firstAt.get(ga)! - firstAt.get(gb)!
      return b.score - a.score || a.index - b.index
    })
    .map((entry) => entry.item)
}

/**
 * The ⌘K palette's dialog: jump to any page, tool or application by typing. A kit Dialog holding a
 * combobox and a listbox of kit Rows; arrow keys move, Enter opens, Esc closes. Loaded on first open
 * (CommandPalette.tsx owns the shortcut and the open state).
 */
export function CommandPaletteDialog({ open, onOpenChange: setOpen }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const [query, setQuery] = useState('')
  const [active, setActive] = useState(0)
  // The results element mounts with the dialog's portal, a commit after `open` flips, so it is state, not a plain ref.
  const [listEl, setListEl] = useState<HTMLDivElement | null>(null)
  const [scrollable, setScrollable] = useState(false)
  const navigate = useNavigate()
  const { user, logout, openAuthDialog } = useSession()
  const sidebar = useOptionalSidebar()
  const listId = useId()
  const searchRef = useRef<HTMLInputElement | null>(null)

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

  // Saved runs are real data: the newest dozen, filtered as you type like everything else.
  const runs = useQuery({
    queryKey: RECENT_RUNS_QUERY_KEY,
    queryFn: () => getHistory({ page_size: 12 }),
    enabled: open && Boolean(user),
    staleTime: 30_000,
  })

  // Phones have no sidebar (the provider still wraps the shell there), so no toggle action either.
  const phone = useKnownBreakpoint() === 'mobile'
  const toggleSidebar = phone ? undefined : sidebar?.toggleSidebar
  const sidebarCollapsed = sidebar?.state === 'collapsed'
  const modKey = useModKey()
  const items = useMemo<PaletteItem[]>(() => {
    const pages: PaletteItem[] = [
      {
        id: 'dashboard',
        group: 'Go to',
        label: dashboardDestination.label,
        icon: dashboardDestination.icon,
        to: dashboardDestination.route,
        keywords: 'home today',
      },
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
          keywords: DESTINATION_KEYWORDS[destination.route],
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
      tone: tool.tone,
      to: tool.route,
    }))
    const actions: PaletteItem[] = [
      user
        ? { id: 'sign-out', group: 'Actions', label: 'Sign out', icon: LogOut, run: () => void logout(), keywords: 'log out logout' }
        : {
            id: 'sign-in',
            group: 'Actions',
            label: 'Sign in',
            icon: LogIn,
            run: () => openAuthDialog({ to: window.location.pathname }),
            keywords: 'log in login account',
          },
    ]
    if (toggleSidebar) {
      actions.push({
        id: 'toggle-sidebar',
        group: 'Actions',
        label: sidebarCollapsed ? 'Expand the sidebar' : 'Collapse the sidebar',
        shortcut: shortcutLabel(modKey, 'B'),
        icon: PanelLeft,
        run: toggleSidebar,
        keywords: 'navigation menu rail',
      })
    }
    const apps: PaletteItem[] = (applications.data?.items ?? []).map((item) => ({
      id: `app-${item.id}`,
      group: 'Applications',
      label: item.title ?? item.label ?? 'Untitled application',
      hint: item.company ?? undefined,
      icon: Briefcase,
      to: `/campaigns/${item.id}`,
      keywords: item.status,
    }))
    const saved: PaletteItem[] = []
    for (const run of runs.data?.items ?? []) {
      const href = historyRunHref(run)
      if (!href) continue
      const display = historyToolDisplay(run.tool_name)
      saved.push({
        id: `run-${run.id}`,
        group: 'Recent runs',
        label: run.label?.trim() || run.metadata?.summary_headline?.trim() || display.label,
        hint: `${display.label} · ${formatRunDay(run.created_at)}`,
        icon: display.icon,
        to: href,
        // Not "result": every run would then match "res", the start of Resume (History answers "results").
        keywords: `${display.label} run runs`,
      })
    }
    return [...pages, ...tools, ...actions, ...apps, ...saved]
  }, [applications.data, runs.data, user, logout, openAuthDialog, toggleSidebar, sidebarCollapsed, modKey])

  const visible = useMemo(() => rank(items, query.trim()), [items, query])

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
    if (item.run) item.run()
    else if (item.to) void navigate({ to: item.to })
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
      <DialogContent
        size="md"
        showClose={false}
        placement="top"
        className="app-palette"
        // The palette is a search the person opened to type into: its field takes focus on a touch screen too (the kit
        // otherwise opens a dialog on its panel there, so a keyboard does not cover a form before it is read).
        onOpenAutoFocus={(event) => {
          if (!searchRef.current) return
          event.preventDefault()
          searchRef.current.focus({ preventScroll: true })
        }}
      >
        <DialogTitle visuallyHidden>Search</DialogTitle>
        <DialogDescription visuallyHidden>
          Jump to a page, tool, application or saved run, or run an action. Use the arrow keys and Enter.
        </DialogDescription>
        <div className="app-palette__search">
          <Input
            ref={searchRef}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={onKeyDown}
            placeholder="Search or jump to…"
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
              icon={<SearchX />}
              title={`No results for “${query}”`}
              description="Try a page, tool, application or run name."
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
                        {item.tone ? <ToolTile tone={item.tone} icon={item.icon} size="sm" /> : <item.icon aria-hidden />}
                      </RowLeading>
                      <RowBody>
                        <RowTitle>{item.label}</RowTitle>
                        {/* Phones: the hint goes under the label, not onto a line of its own at the far right. */}
                        {phone && item.hint ? <RowSubtitle className="app-palette__sub">{item.hint}</RowSubtitle> : null}
                      </RowBody>
                      {phone ? null : (
                        <RowMeta className="app-palette__meta">
                          {item.hint}
                          {item.shortcut ? <span className="app-palette__shortcut">{item.shortcut}</span> : null}
                          {index === active ? <CornerDownLeft aria-hidden /> : null}
                        </RowMeta>
                      )}
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

import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { Search } from 'lucide-react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '#/components/ui/dialog'
import { Input } from '#/components/ui/input'
import { useHistory } from '#/hooks/useHistory'
import { useSession } from '#/hooks/useSession'
import { toolList } from '#/lib/tools/registry'

type PaletteItem = {
  label: string
  description: string
  to: string
}

export function CommandPalette() {
  const navigate = useNavigate()
  const { status } = useSession()
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const recentRuns = useHistory(
    { page: 1, page_size: 5 },
    status === 'authenticated',
  )

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault()
        setOpen((value) => !value)
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])

  const items = useMemo<PaletteItem[]>(() => {
    const staticItems: PaletteItem[] = [
      { label: 'Dashboard', description: 'Command center', to: '/dashboard' },
      { label: 'History', description: 'Saved runs and favorites', to: '/history' },
      { label: 'Account', description: 'Profile and account state', to: '/account' },
      { label: 'Settings', description: 'Theme and preferences', to: '/settings' },
      ...toolList.map((tool) => ({
        label: tool.label,
        description: tool.summary,
        to: tool.route,
      })),
    ]

    const recentItems =
      recentRuns.data?.items.map((item) => ({
        label: item.label || `${item.tool_name} result`,
        description: 'Recent run',
        to: `${toolList.find((tool) => tool.id === item.tool_name)?.route || '/history'}/result/${item.id}`,
      })) || []

    return [...staticItems, ...recentItems]
  }, [recentRuns.data?.items])

  const filtered = items.filter((item) =>
    `${item.label} ${item.description}`.toLowerCase().includes(query.toLowerCase()),
  )

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Jump anywhere</DialogTitle>
        </DialogHeader>
        <div className="grid gap-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)]" size={16} />
            <Input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search tools, pages, and recent runs…"
              className="pl-10"
            />
          </div>
          <div className="grid max-h-[24rem] gap-2 overflow-y-auto">
            {filtered.map((item) => (
              <button
                key={`${item.label}-${item.to}`}
                className="command-palette-result"
                onClick={async () => {
                  setOpen(false)
                  await navigate({ to: item.to })
                }}
                type="button"
              >
                <span className="grid gap-1">
                  <span>{item.label}</span>
                  <span className="small-copy muted-copy">{item.description}</span>
                </span>
                <span className="small-copy muted-copy">↩</span>
              </button>
            ))}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

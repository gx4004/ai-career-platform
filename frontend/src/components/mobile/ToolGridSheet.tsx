import { Link } from '@tanstack/react-router'
import type { NavDestination } from '#/lib/navigation/navGroups'
import { navGroups } from '#/lib/navigation/navGroups'
import { toolList } from '#/lib/tools/registry'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '#/components/ui/sheet'

interface ToolGridSheetProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  showAuthenticatedLinks?: boolean
}

function DestinationLink({
  destination,
  onNavigate,
}: {
  destination: NavDestination
  onNavigate: () => void
}) {
  return (
    <Link to={destination.route} className="mobile-tool-grid-item" onClick={onNavigate}>
      <span className="mobile-tool-grid-icon">
        <destination.icon size={22} />
      </span>
      <span className="mobile-tool-grid-label">{destination.label}</span>
    </Link>
  )
}

export function ToolGridSheet({
  open,
  onOpenChange,
  showAuthenticatedLinks = false,
}: ToolGridSheetProps) {
  const close = () => onOpenChange(false)
  // Mirrors the sidebar's grouping: Tools always shows, "Job search" is
  // owner-only (same gate the old flat grid used), "You" (CV Studio,
  // Profile, History) shows for anyone.
  const groups = navGroups.map((group) => ({
    ...group,
    destinations:
      group.id === 'job-search' && !showAuthenticatedLinks ? [] : group.destinations,
  }))

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="mobile-tool-grid-sheet">
        <SheetHeader>
          <SheetTitle className="mobile-tool-grid-title">Tools</SheetTitle>
          <SheetDescription className="sr-only">
            Career tools and enabled owner workspace destinations, grouped the same way as the
            sidebar.
          </SheetDescription>
        </SheetHeader>

        {/* The sheet title already reads "Tools", so this first section skips a
            second visible "Tools" heading and only labels itself for a11y. */}
        <section aria-label="Tools">
          <div className="mobile-tool-grid">
            {toolList.map((tool) => (
              <Link
                key={tool.id}
                to={tool.route}
                className="mobile-tool-grid-item"
                onClick={close}
              >
                <span className="mobile-tool-grid-icon">
                  <tool.icon size={22} />
                </span>
                <span className="mobile-tool-grid-label">{tool.label}</span>
              </Link>
            ))}
          </div>
        </section>

        {groups.map((group) =>
          group.destinations.length > 0 ? (
            <section key={group.id} aria-label={group.label}>
              <h3 className="mobile-tool-grid-group-title">{group.label}</h3>
              <div className="mobile-tool-grid">
                {group.destinations.map((destination) => (
                  <DestinationLink key={destination.route} destination={destination} onNavigate={close} />
                ))}
              </div>
            </section>
          ) : null,
        )}
      </SheetContent>
    </Sheet>
  )
}

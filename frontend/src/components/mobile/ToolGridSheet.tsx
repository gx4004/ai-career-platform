import { Link } from '@tanstack/react-router'
import type { ReactNode } from 'react'
import { Search } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import {
  Avatar,
  Section,
  Sheet,
  SheetBody,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  Sticker,
  StretchedLink,
  ToolTile,
} from '#/components/kit'
import type { Tone } from '#/components/kit'
import { navGroups } from '#/lib/navigation/navGroups'
import { toolList } from '#/lib/tools/registry'

interface ToolGridSheetProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  showAuthenticatedLinks?: boolean
  /** Signed-in person's name: adds the Account tile (the avatar and the name). */
  accountName?: string
  /** Adds the Search tile; the caller opens the command palette. */
  onSearch?: () => void
}

type SheetDestination = { key: string; label: string; route: string; icon: LucideIcon }

/** A tone-filled link tile: a kit Sticker whose whole plate is the link; the tool's icon sits on a white ToolTile. */
function ToolTileLink({
  label,
  route,
  icon,
  tone,
  onNavigate,
}: {
  label: string
  route: string
  icon: LucideIcon
  tone: Tone
  onNavigate: () => void
}) {
  return (
    <Sticker as="li" size="sm" tone={tone} className="app-more__tile app-more__tile--tool">
      <StretchedLink asChild>
        <Link to={route} onClick={onNavigate}>
          <ToolTile tone="white" size="md" icon={icon} />
          <span className="app-more__tile-label">{label}</span>
        </Link>
      </StretchedLink>
    </Sticker>
  )
}

/** The rest of the workspace as white 48px tiles, two to a row. */
function LinkTiles({
  label,
  destinations,
  onNavigate,
  children,
}: {
  label: string
  destinations: SheetDestination[]
  onNavigate: () => void
  children?: ReactNode
}) {
  return (
    <ul className="app-more__links" aria-label={label}>
      {destinations.map((destination) => (
        <Sticker key={destination.key} as="li" size="sm" className="app-more__tile">
          <StretchedLink asChild>
            <Link to={destination.route} onClick={onNavigate}>
              <destination.icon aria-hidden />
              <span className="app-more__tile-label">{destination.label}</span>
            </Link>
          </StretchedLink>
        </Sticker>
      ))}
      {children}
    </ul>
  )
}

/**
 * The phone's More sheet: the six tools as colour tiles, then the same groups the sidebar has as white tiles.
 * It keeps the dialog name "More" (silent title) and the visible headings Tools, Job search and You.
 */
export function ToolGridSheet({
  open,
  onOpenChange,
  showAuthenticatedLinks = false,
  accountName,
  onSearch,
}: ToolGridSheetProps) {
  const close = () => onOpenChange(false)
  // Mirrors the sidebar's grouping: Tools always shows, "Job search" is owner-only
  // (the same gate the sidebar uses), "You" (CV Studio, Profile, History) shows for anyone.
  const groups = navGroups
    .filter((group) => group.id !== 'job-search' || showAuthenticatedLinks)
    .map((group) => ({
      id: group.id,
      label: group.label,
      destinations: group.destinations.map((destination) => ({ ...destination, key: destination.route })),
    }))

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="app-more-sheet">
        <SheetHeader>
          <SheetTitle visuallyHidden>More</SheetTitle>
          <SheetDescription visuallyHidden>
            The career tools and the rest of your workspace, grouped like the sidebar.
          </SheetDescription>
        </SheetHeader>
        <SheetBody className="app-more">
          <Section title="Tools" headingLevel={3}>
            <ul className="app-more__tools" aria-label="Tools">
              {toolList.map((tool) => (
                <ToolTileLink
                  key={tool.id}
                  label={tool.label}
                  route={tool.route}
                  icon={tool.icon}
                  tone={tool.tone}
                  onNavigate={close}
                />
              ))}
            </ul>
          </Section>
          {groups.map((group) => (
            <Section
              key={group.id}
              title={group.label}
              headingLevel={3}
              className="app-more__group"
            >
              <LinkTiles label={group.label} destinations={group.destinations} onNavigate={close}>
                {group.id === 'you' && onSearch ? (
                  <Sticker as="li" size="sm" className="app-more__tile">
                    <StretchedLink asChild>
                      <button
                        type="button"
                        onClick={() => {
                          close()
                          // The sheet is a modal dialog: let it finish closing so the palette opens into a free page.
                          window.setTimeout(onSearch, 0)
                        }}
                      >
                        <Search aria-hidden />
                        <span className="app-more__tile-label">Search</span>
                      </button>
                    </StretchedLink>
                  </Sticker>
                ) : null}
                {group.id === 'you' && accountName ? (
                  <Sticker as="li" size="sm" className="app-more__tile">
                    <StretchedLink asChild>
                      <Link to="/account" onClick={close}>
                        <Avatar name={accountName} decorative />
                        <span className="app-more__tile-label">{accountName}</span>
                      </Link>
                    </StretchedLink>
                  </Sticker>
                ) : null}
              </LinkTiles>
            </Section>
          ))}
        </SheetBody>
      </SheetContent>
    </Sheet>
  )
}

import { Link } from '@tanstack/react-router'
import type { LucideIcon } from 'lucide-react'
import {
  List,
  Row,
  RowBody,
  RowLeading,
  RowTitle,
  Section,
  Sheet,
  SheetBody,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '#/components/kit'
import { navGroups } from '#/lib/navigation/navGroups'
import { toolList } from '#/lib/tools/registry'

interface ToolGridSheetProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  showAuthenticatedLinks?: boolean
}

type SheetDestination = { key: string; label: string; route: string; icon: LucideIcon }

function DestinationList({
  label,
  destinations,
  onNavigate,
}: {
  label: string
  destinations: SheetDestination[]
  onNavigate: () => void
}) {
  return (
    <List aria-label={label}>
      {destinations.map((destination) => (
        <Row key={destination.key}>
          <RowLeading>
            <destination.icon aria-hidden />
          </RowLeading>
          <RowBody>
            <RowTitle asChild>
              <Link to={destination.route} onClick={onNavigate}>
                {destination.label}
              </Link>
            </RowTitle>
          </RowBody>
        </Row>
      ))}
    </List>
  )
}

/** The phone's More sheet: the six tools, then the same groups the sidebar has. */
export function ToolGridSheet({ open, onOpenChange, showAuthenticatedLinks = false }: ToolGridSheetProps) {
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
  const tools = toolList.map((tool) => ({ key: tool.id, label: tool.label, route: tool.route, icon: tool.icon }))

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom">
        <SheetHeader>
          <SheetTitle>More</SheetTitle>
          <SheetDescription visuallyHidden>
            The career tools and the rest of your workspace, grouped like the sidebar.
          </SheetDescription>
        </SheetHeader>
        <SheetBody className="app-more">
          <Section title="Tools" headingLevel={3}>
            <DestinationList label="Tools" destinations={tools} onNavigate={close} />
          </Section>
          <div className="app-more__groups">
            {groups.map((group) => (
              <Section key={group.id} title={group.label} headingLevel={3}>
                <DestinationList label={group.label} destinations={group.destinations} onNavigate={close} />
              </Section>
            ))}
          </div>
        </SheetBody>
      </SheetContent>
    </Sheet>
  )
}

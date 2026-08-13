import { Link } from '@tanstack/react-router'
import { BadgeCheck, ClipboardCheck, Compass, Sprout } from 'lucide-react'
import { registryEntries } from '#/lib/tools/registry'
import {
  isR11EvidenceProfileEnabled,
  isR12CvStudioEnabled,
  isR14DiscoveryEnabled,
  isR15QueueEnabled,
  isR17DevelopmentLoopEnabled,
} from '#/lib/flags/featureFlags'
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

const ownerDestinations = [
  { label: 'Evidence', route: '/profile', icon: BadgeCheck, enabled: isR11EvidenceProfileEnabled },
  { label: 'Discover', route: '/discovery', icon: Compass, enabled: isR14DiscoveryEnabled },
  { label: 'Queue', route: '/queue', icon: ClipboardCheck, enabled: isR15QueueEnabled },
  { label: 'Development', route: '/development-plan', icon: Sprout, enabled: isR17DevelopmentLoopEnabled },
] as const

export function ToolGridSheet({
  open,
  onOpenChange,
  showAuthenticatedLinks = false,
}: ToolGridSheetProps) {
  const visibleOwnerDestinations = showAuthenticatedLinks
    ? ownerDestinations.filter((destination) => destination.enabled())
    : []

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="mobile-tool-grid-sheet">
        <SheetHeader>
          <SheetTitle className="mobile-tool-grid-title">Tools</SheetTitle>
          <SheetDescription className="sr-only">
            Career tools and enabled owner workspace destinations.
          </SheetDescription>
        </SheetHeader>
        <div className="mobile-tool-grid">
          {registryEntries
            .filter((tool) => tool.id !== 'cv-studio' || isR12CvStudioEnabled())
            .map((tool) => (
            <Link
              key={tool.id}
              to={tool.route}
              className="mobile-tool-grid-item"
              onClick={() => onOpenChange(false)}
            >
              <span className="mobile-tool-grid-icon">
                <tool.icon size={22} />
              </span>
              <span className="mobile-tool-grid-label">{tool.label}</span>
            </Link>
            ))}
          {visibleOwnerDestinations.map((destination) => (
            <Link
              key={destination.route}
              to={destination.route}
              className="mobile-tool-grid-item"
              onClick={() => onOpenChange(false)}
            >
              <span className="mobile-tool-grid-icon">
                <destination.icon size={22} />
              </span>
              <span className="mobile-tool-grid-label">{destination.label}</span>
            </Link>
          ))}
        </div>
      </SheetContent>
    </Sheet>
  )
}

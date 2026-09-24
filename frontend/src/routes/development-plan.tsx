import { createFileRoute, redirect } from '@tanstack/react-router'
import { isR17DevelopmentLoopEnabled } from '#/lib/flags/featureFlags'
import { requireEnabledOutcome } from '#/lib/flags/outcomeGuard'

// Phase 1b (#321): the Development Plan is folded into the Evidence Profile
// page as its "Skills to build" section. This route now only redirects
// existing links and bookmarks there, and stays dark with its feature flag.
export const Route = createFileRoute('/development-plan')({
  beforeLoad: () => {
    requireEnabledOutcome(isR17DevelopmentLoopEnabled())
    throw redirect({ to: '/profile', hash: 'skills-to-build' })
  },
})

import { createFileRoute, redirect } from '@tanstack/react-router'

// Phase 1b (#321): the Development Plan is folded into the Evidence Profile
// page as its "Skills to build" section. This route now only redirects
// existing links and bookmarks there.
export const Route = createFileRoute('/development-plan')({
  beforeLoad: () => {
    throw redirect({ to: '/profile', hash: 'skills-to-build' })
  },
})

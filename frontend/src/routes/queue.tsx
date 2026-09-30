import { createFileRoute, redirect } from '@tanstack/react-router'

// The Application Queue merged into Applications (#360). This route only
// redirects existing links and bookmarks to the board.
export const Route = createFileRoute('/queue')({
  beforeLoad: () => {
    throw redirect({ to: '/campaigns' })
  },
})

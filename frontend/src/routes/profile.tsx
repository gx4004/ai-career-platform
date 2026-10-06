import { createFileRoute } from '@tanstack/react-router'
import { ProfilePage } from '#/pages/profile-page'

export const Route = createFileRoute('/profile')({
  head: () => ({
    meta: [{ title: 'Evidence Profile | Career Workbench' }],
  }),
  component: ProfilePage,
})

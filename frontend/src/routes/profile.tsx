import { createFileRoute } from '@tanstack/react-router'
import { ProfilePage } from '#/pages/profile-page'

export const Route = createFileRoute('/profile')({
  head: () => ({
    meta: [{ title: 'Profile | Career Workbench' }],
  }),
  component: ProfilePage,
})

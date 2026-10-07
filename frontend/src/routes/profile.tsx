import { createFileRoute } from '@tanstack/react-router'
import { ProfilePage } from '#/pages/profile-page'

type ProfileSearch = {
  /** `fact`: arrived from "Add skills" (dashboard matches); opens Add a fact once, then drops it. */
  add?: 'fact'
}

export const Route = createFileRoute('/profile')({
  head: () => ({
    meta: [{ title: 'Profile | Career Workbench' }],
  }),
  validateSearch: (search: Record<string, unknown>): ProfileSearch => ({
    add: search.add === 'fact' ? 'fact' : undefined,
  }),
  component: ProfilePage,
})

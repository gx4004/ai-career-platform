import { createFileRoute } from '@tanstack/react-router'
import { AccountPage } from '#/pages/account-page'

export const Route = createFileRoute('/account')({
  head: () => ({
    meta: [{ title: 'Account | Career Workbench' }],
  }),
  component: AccountPage,
})

import { createFileRoute } from '@tanstack/react-router'
import { CookiePolicyPage } from '#/pages/legal/CookiePolicyPage'

export const Route = createFileRoute('/cookies')({
  head: () => ({
    meta: [{ title: 'Cookie Policy | Career Workbench' }],
  }),
  component: CookiePolicyPage,
})

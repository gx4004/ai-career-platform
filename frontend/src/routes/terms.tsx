import { createFileRoute } from '@tanstack/react-router'
import { TermsOfServicePage } from '#/pages/legal/TermsOfServicePage'

export const Route = createFileRoute('/terms')({
  head: () => ({
    meta: [{ title: 'Terms of Service | Career Workbench' }],
  }),
  component: TermsOfServicePage,
})

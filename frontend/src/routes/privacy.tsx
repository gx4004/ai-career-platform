import { createFileRoute } from '@tanstack/react-router'
import { PrivacyPolicyPage } from '#/pages/legal/PrivacyPolicyPage'

export const Route = createFileRoute('/privacy')({
  head: () => ({
    meta: [{ title: 'Privacy Policy | Career Workbench' }],
  }),
  component: PrivacyPolicyPage,
})

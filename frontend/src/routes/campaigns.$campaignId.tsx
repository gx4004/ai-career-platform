import { createFileRoute } from '@tanstack/react-router'
import { ApplicationRoutePage } from '#/pages/application-page'

export const Route = createFileRoute('/campaigns/$campaignId')({
  head: () => ({ meta: [{ title: 'Application | Career Workbench' }] }),
  component: ApplicationRoutePage,
})

import { createFileRoute } from '@tanstack/react-router'
import { JobMatchPage } from '#/pages/tool-pages'

export const Route = createFileRoute('/job-match')({
  head: () => ({
    meta: [{ title: 'Job Match | Career Workbench' }],
  }),
  component: JobMatchPage,
})

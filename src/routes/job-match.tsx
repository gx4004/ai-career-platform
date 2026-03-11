import { createFileRoute } from '@tanstack/react-router'
import { JobMatchToolPage } from '#/components/tooling/JobMatchToolPage'

export const Route = createFileRoute('/job-match')({
  head: () => ({
    meta: [{ title: 'Job Match | Career Workbench' }],
  }),
  component: JobMatchPage,
})

function JobMatchPage() {
  return <JobMatchToolPage />
}

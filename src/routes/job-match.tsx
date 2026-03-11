import { createFileRoute } from '@tanstack/react-router'
import { ToolRouteScreen } from '#/components/tooling/ToolRouteScreen'

export const Route = createFileRoute('/job-match')({
  component: JobMatchPage,
})

function JobMatchPage() {
  return <ToolRouteScreen toolId="job-match" />
}

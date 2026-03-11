import { createFileRoute } from '@tanstack/react-router'
import { ToolResultScreen } from '#/components/tooling/ToolResultScreen'

export const Route = createFileRoute('/job-match/result/$historyId')({
  component: JobMatchResultPage,
})

function JobMatchResultPage() {
  const { historyId } = Route.useParams()
  return <ToolResultScreen toolId="job-match" historyId={historyId} />
}

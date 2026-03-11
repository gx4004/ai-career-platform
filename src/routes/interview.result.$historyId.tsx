import { createFileRoute } from '@tanstack/react-router'
import { ToolResultScreen } from '#/components/tooling/ToolResultScreen'

export const Route = createFileRoute('/interview/result/$historyId')({
  component: InterviewResultPage,
})

function InterviewResultPage() {
  const { historyId } = Route.useParams()
  return <ToolResultScreen toolId="interview" historyId={historyId} />
}

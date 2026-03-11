import { createFileRoute } from '@tanstack/react-router'
import { ToolResultScreen } from '#/components/tooling/ToolResultScreen'

export const Route = createFileRoute('/resume/result/$historyId')({
  component: ResumeResultPage,
})

function ResumeResultPage() {
  const { historyId } = Route.useParams()
  return <ToolResultScreen toolId="resume" historyId={historyId} />
}

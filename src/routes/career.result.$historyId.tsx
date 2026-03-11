import { createFileRoute } from '@tanstack/react-router'
import { ToolResultScreen } from '#/components/tooling/ToolResultScreen'

export const Route = createFileRoute('/career/result/$historyId')({
  component: CareerResultPage,
})

function CareerResultPage() {
  const { historyId } = Route.useParams()
  return <ToolResultScreen toolId="career" historyId={historyId} />
}

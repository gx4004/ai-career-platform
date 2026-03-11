import { createFileRoute } from '@tanstack/react-router'
import { ToolResultScreen } from '#/components/tooling/ToolResultScreen'

export const Route = createFileRoute('/cover-letter/result/$historyId')({
  component: CoverLetterResultPage,
})

function CoverLetterResultPage() {
  const { historyId } = Route.useParams()
  return <ToolResultScreen toolId="cover-letter" historyId={historyId} />
}

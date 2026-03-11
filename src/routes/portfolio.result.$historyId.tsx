import { createFileRoute } from '@tanstack/react-router'
import { ToolResultScreen } from '#/components/tooling/ToolResultScreen'

export const Route = createFileRoute('/portfolio/result/$historyId')({
  component: PortfolioResultPage,
})

function PortfolioResultPage() {
  const { historyId } = Route.useParams()
  return <ToolResultScreen toolId="portfolio" historyId={historyId} />
}

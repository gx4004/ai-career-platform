import { createFileRoute } from '@tanstack/react-router'
import { ToolRouteScreen } from '#/components/tooling/ToolRouteScreen'

export const Route = createFileRoute('/portfolio')({
  component: PortfolioPage,
})

function PortfolioPage() {
  return <ToolRouteScreen toolId="portfolio" />
}

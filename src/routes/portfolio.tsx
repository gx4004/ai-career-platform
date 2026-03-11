import { createFileRoute } from '@tanstack/react-router'
import { PortfolioToolPage } from '#/components/tooling/PortfolioToolPage'

export const Route = createFileRoute('/portfolio')({
  head: () => ({
    meta: [{ title: 'Portfolio Planner | Career Workbench' }],
  }),
  component: PortfolioPage,
})

function PortfolioPage() {
  return <PortfolioToolPage />
}

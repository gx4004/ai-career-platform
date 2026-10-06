import { createFileRoute } from '@tanstack/react-router'
import { PortfolioPage } from '#/pages/tool-pages'

export const Route = createFileRoute('/portfolio')({
  head: () => ({
    meta: [{ title: 'Portfolio Planner | Career Workbench' }],
  }),
  component: PortfolioPage,
})

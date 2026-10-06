import { createFileRoute } from '@tanstack/react-router'
import { CareerPage } from '#/pages/tool-pages'

export const Route = createFileRoute('/career')({
  head: () => ({
    meta: [{ title: 'Career Planner | Career Workbench' }],
  }),
  component: CareerPage,
})

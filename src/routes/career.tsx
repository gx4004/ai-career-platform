import { createFileRoute } from '@tanstack/react-router'
import { CareerToolPage } from '#/components/tooling/CareerToolPage'

export const Route = createFileRoute('/career')({
  head: () => ({
    meta: [{ title: 'Career Planner | Career Workbench' }],
  }),
  component: CareerPage,
})

function CareerPage() {
  return <CareerToolPage />
}

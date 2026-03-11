import { createFileRoute } from '@tanstack/react-router'
import { ToolRouteScreen } from '#/components/tooling/ToolRouteScreen'

export const Route = createFileRoute('/career')({
  component: CareerPage,
})

function CareerPage() {
  return <ToolRouteScreen toolId="career" />
}

import { createFileRoute } from '@tanstack/react-router'
import { ToolRouteScreen } from '#/components/tooling/ToolRouteScreen'

export const Route = createFileRoute('/resume')({
  component: ResumePage,
})

function ResumePage() {
  return <ToolRouteScreen toolId="resume" />
}

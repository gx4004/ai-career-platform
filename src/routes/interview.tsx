import { createFileRoute } from '@tanstack/react-router'
import { ToolRouteScreen } from '#/components/tooling/ToolRouteScreen'

export const Route = createFileRoute('/interview')({
  component: InterviewPage,
})

function InterviewPage() {
  return <ToolRouteScreen toolId="interview" />
}

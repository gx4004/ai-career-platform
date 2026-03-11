import { createFileRoute } from '@tanstack/react-router'
import { ToolRouteScreen } from '#/components/tooling/ToolRouteScreen'

export const Route = createFileRoute('/cover-letter')({
  component: CoverLetterPage,
})

function CoverLetterPage() {
  return <ToolRouteScreen toolId="cover-letter" />
}

import { createFileRoute } from '@tanstack/react-router'
import { InterviewToolPage } from '#/components/tooling/InterviewToolPage'

export const Route = createFileRoute('/interview')({
  head: () => ({
    meta: [{ title: 'Interview Prep | Career Workbench' }],
  }),
  component: InterviewPage,
})

function InterviewPage() {
  return <InterviewToolPage />
}

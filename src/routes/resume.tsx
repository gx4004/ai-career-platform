import { createFileRoute } from '@tanstack/react-router'
import { ResumeToolPage } from '#/components/tooling/ResumeToolPage'

export const Route = createFileRoute('/resume')({
  head: () => ({
    meta: [{ title: 'Resume Analysis | Career Workbench' }],
  }),
  component: ResumePage,
})

function ResumePage() {
  return <ResumeToolPage />
}

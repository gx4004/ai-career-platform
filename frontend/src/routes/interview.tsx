import { createFileRoute } from '@tanstack/react-router'
import { InterviewPage } from '#/pages/tool-pages'

export const Route = createFileRoute('/interview')({
  head: () => ({
    meta: [{ title: 'Interview Prep | Career Workbench' }],
  }),
  component: InterviewPage,
})

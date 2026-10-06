import { createFileRoute } from '@tanstack/react-router'
import { ResumePage } from '#/pages/tool-pages'

export const Route = createFileRoute('/resume')({
  head: () => ({
    meta: [{ title: 'Resume Analysis | Career Workbench' }],
  }),
  component: ResumePage,
})

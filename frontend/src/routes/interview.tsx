import { createFileRoute } from '@tanstack/react-router'
import { tools } from '#/lib/tools/registry'
import { InterviewPage } from '#/pages/tool-pages'

export const Route = createFileRoute('/interview')({
  head: () => ({
    meta: [{ title: `${tools.interview.label} | Career Workbench` }],
  }),
  component: InterviewPage,
})

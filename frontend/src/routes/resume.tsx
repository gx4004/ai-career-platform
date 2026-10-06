import { createFileRoute } from '@tanstack/react-router'
import { tools } from '#/lib/tools/registry'
import { ResumePage } from '#/pages/tool-pages'

export const Route = createFileRoute('/resume')({
  head: () => ({
    meta: [{ title: `${tools.resume.label} | Career Workbench` }],
  }),
  component: ResumePage,
})

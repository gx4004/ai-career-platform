import { createFileRoute } from '@tanstack/react-router'
import { tools } from '#/lib/tools/registry'
import { CareerPage } from '#/pages/tool-pages'

export const Route = createFileRoute('/career')({
  head: () => ({
    meta: [{ title: `${tools.career.label} | Career Workbench` }],
  }),
  component: CareerPage,
})

import { createFileRoute } from '@tanstack/react-router'
import { ImprintPage } from '#/pages/legal/ImprintPage'

export const Route = createFileRoute('/imprint')({
  head: () => ({
    meta: [{ title: 'Imprint | Career Workbench' }],
  }),
  component: ImprintPage,
})

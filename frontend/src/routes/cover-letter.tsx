import { createFileRoute } from '@tanstack/react-router'
import { CoverLetterPage } from '#/pages/tool-pages'

export const Route = createFileRoute('/cover-letter')({
  head: () => ({
    meta: [{ title: 'Cover Letter | Career Workbench' }],
  }),
  component: CoverLetterPage,
})

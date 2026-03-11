import { createFileRoute } from '@tanstack/react-router'
import { CoverLetterToolPage } from '#/components/tooling/CoverLetterToolPage'

export const Route = createFileRoute('/cover-letter')({
  head: () => ({
    meta: [{ title: 'Cover Letter | Career Workbench' }],
  }),
  component: CoverLetterPage,
})

function CoverLetterPage() {
  return <CoverLetterToolPage />
}

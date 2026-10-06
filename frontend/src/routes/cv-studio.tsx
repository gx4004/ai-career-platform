import { createFileRoute } from '@tanstack/react-router'
import { CvStudioPage } from '#/pages/cv-studio-page'

// The live paper preview uses the exact bundled OFL faces the PDF/DOCX
// renderer uses, served by the API itself (@font-face rules in
// styles/cv-studio.css) instead of pulling different files from Google
// Fonts (#322).

type CvStudioSearch = {
  /** `profile`: arrived from "Start a CV from these facts" on the profile; opens Start a new CV once, then drops it. */
  start?: 'profile'
}

export const Route = createFileRoute('/cv-studio')({
  head: () => ({
    meta: [{ title: 'CV Studio | Career Workbench' }],
  }),
  validateSearch: (search: Record<string, unknown>): CvStudioSearch => ({
    start: search.start === 'profile' ? 'profile' : undefined,
  }),
  component: CvStudioPage,
})

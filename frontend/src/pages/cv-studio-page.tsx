import { useNavigate, useSearch } from '@tanstack/react-router'
import { CvStudio } from '#/components/cv-studio/CvStudio'

export function CvStudioPage() {
  const { start } = useSearch({ from: '/cv-studio' })
  const navigate = useNavigate({ from: '/cv-studio' })
  return (
    <CvStudio
      startFrom={start}
      // The hand-off is one-shot: a reload or Back must not open the dialog again.
      onStartHandled={() => void navigate({ search: {}, replace: true })}
    />
  )
}

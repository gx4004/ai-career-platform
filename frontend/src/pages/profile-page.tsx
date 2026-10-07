import { useNavigate, useSearch } from '@tanstack/react-router'
import { EvidenceProfilePage } from '#/components/profile/EvidenceProfilePage'

export function ProfilePage() {
  const { add } = useSearch({ from: '/profile' })
  const navigate = useNavigate({ from: '/profile' })
  return (
    <EvidenceProfilePage
      startAdding={add === 'fact'}
      // The hand-off is one-shot: a reload or Back must not open the dialog again.
      onStartHandled={() => void navigate({ search: {}, replace: true })}
    />
  )
}

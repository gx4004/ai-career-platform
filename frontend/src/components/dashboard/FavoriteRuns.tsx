import { Star } from 'lucide-react'
import { RunList } from '#/components/dashboard/RunList'
import { useBreakpoint } from '#/hooks/use-breakpoint'

export function FavoriteRuns() {
  const pageSize = useBreakpoint() === 'mobile' ? 3 : 5
  return (
    <RunList
      eyebrow="Starred"
      title="Your best results, pinned"
      emptyIcon={Star}
      emptyText="Star a result and it lands here."
      unauthText="Favorites become available after sign-in."
      queryParams={{ page: 1, page_size: pageSize, favorite: true }}
      showFavoriteStar
    />
  )
}

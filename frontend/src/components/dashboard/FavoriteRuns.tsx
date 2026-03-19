import { Star } from 'lucide-react'
import { RunList } from '#/components/dashboard/RunList'

export function FavoriteRuns() {
  return (
    <RunList
      eyebrow="Starred"
      title="Your best results, pinned"
      emptyIcon={Star}
      emptyText="Star a result to keep it within reach."
      unauthText="Favorites become available after sign-in."
      queryParams={{ page: 1, page_size: 5, favorite: true }}
      showFavoriteStar
    />
  )
}

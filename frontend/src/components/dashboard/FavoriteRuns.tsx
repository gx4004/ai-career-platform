import { RunList } from '#/components/dashboard/RunList'
import { useBreakpoint } from '#/hooks/use-breakpoint'

export function FavoriteRuns() {
  const pageSize = useBreakpoint() === 'mobile' ? 3 : 5
  return (
    <RunList
      title="Starred results"
      emptyTitle="No starred results"
      emptyText="Star a result and it lands here."
      untitled="Untitled favorite"
      queryParams={{ page: 1, page_size: pageSize, favorite: true }}
      showDate={false}
    />
  )
}

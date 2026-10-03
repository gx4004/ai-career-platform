import { RunList } from '#/components/dashboard/RunList'
import { useBreakpoint } from '#/hooks/use-breakpoint'

export function RecentRuns() {
  // Phones show a short vertical list: fetch three instead of hiding rows in CSS.
  const pageSize = useBreakpoint() === 'mobile' ? 3 : 5
  return (
    <RunList
      title="Recent activity"
      emptyTitle="No runs yet"
      emptyText="Run a tool to see your results here."
      queryParams={{ page: 1, page_size: pageSize }}
      viewAllTo="/history"
    />
  )
}

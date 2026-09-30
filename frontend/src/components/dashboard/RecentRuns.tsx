import { Clock } from 'lucide-react'
import { RunList } from '#/components/dashboard/RunList'
import { useBreakpoint } from '#/hooks/use-breakpoint'

export function RecentRuns() {
  // Phones show a short vertical list: fetch three instead of hiding rows in CSS.
  const pageSize = useBreakpoint() === 'mobile' ? 3 : 5
  return (
    <RunList
      eyebrow="Recent"
      title="Pick up where you left off"
      emptyIcon={Clock}
      emptyText="Run a tool to see your results here."
      unauthText="Sign in to review recent runs."
      queryParams={{ page: 1, page_size: pageSize }}
      viewAllTo="/history"
    />
  )
}

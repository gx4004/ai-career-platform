import { Clock } from 'lucide-react'
import { RunList } from '#/components/dashboard/RunList'

export function RecentRuns() {
  return (
    <RunList
      eyebrow="Recent"
      title="Pick up where you left off"
      emptyIcon={Clock}
      emptyText="Run a tool to see your results here."
      unauthText="Sign in to review recent runs."
      queryParams={{ page: 1, page_size: 5 }}
    />
  )
}

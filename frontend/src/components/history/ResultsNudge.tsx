import { Link } from '@tanstack/react-router'
import { ArrowRight, Star } from 'lucide-react'
import { useHistory } from '#/hooks/useHistory'
import { isR7ResultsNudgeEnabled } from '#/lib/flags/featureFlags'
import { getToolByHistoryName } from '#/lib/tools/registry'
import { trackTelemetry } from '#/lib/telemetry/client'

const MAX_NUDGED_RESULTS = 3

export function ResultsNudge() {
  const enabled = isR7ResultsNudgeEnabled()
  const recentQuery = useHistory({ page: 1, page_size: 5 }, enabled)
  const recentUnfavorited = (recentQuery.data?.items ?? [])
    .filter((item) => !item.is_favorite)
    .slice(0, MAX_NUDGED_RESULTS)

  if (!enabled || recentUnfavorited.length === 0) return null

  return (
    <section
      aria-label="Recent results reminder"
      className="section-card grid gap-3 p-5"
    >
      <div className="flex items-start gap-3">
        <span className="rounded-full bg-[var(--surface-focus)] p-2 text-[var(--accent)]" aria-hidden>
          <Star size={18} />
        </span>
        <div className="grid gap-1">
          <p className="eyebrow">Keep useful work close</p>
          <h2 className="section-title">Recent results are not starred yet</h2>
          <p className="small-copy muted-copy">
            Reopen a result and add it to favorites if you want it within easy reach.
          </p>
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        {recentUnfavorited.map((item) => {
          const tool = getToolByHistoryName(item.tool_name)
          const route = tool
            ? tool.resultRoute.replace('$historyId', item.id)
            : '/history'
          const label = item.label || item.metadata.primary_recommendation_title || 'Untitled result'

          return (
            <Link
              key={item.id}
              to={route}
              className="button-toolbar-utility inline-flex items-center gap-2 rounded-full border px-3 py-2 text-sm"
              onClick={() => {
                if (!tool) return
                trackTelemetry({
                  event_name: 'workspace_resumed',
                  tool_id: tool.id,
                  access_mode: 'authenticated',
                  saved: true,
                })
              }}
            >
              <span>{label}</span>
              <ArrowRight size={14} aria-hidden />
            </Link>
          )
        })}
      </div>
    </section>
  )
}

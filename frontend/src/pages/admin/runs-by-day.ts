import { getAdminRuns } from '#/lib/api/admin'

/** The sparkline's window. */
export const RUN_DAYS = 14
const PAGE_SIZE = 100
/** A page of runs is one request: stop at 500 runs so the dashboard never walks a whole table. */
const MAX_PAGES = 5

export type DayCount = { key: string; date: Date; count: number }

const dayKey = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`

/** The run count of each of the last `days` calendar days (the viewer's own day boundaries), oldest first. */
export function bucketRunsByDay(
  runs: ReadonlyArray<{ created_at: string | null }>,
  days = RUN_DAYS,
  now = new Date(),
): DayCount[] {
  const buckets: DayCount[] = []
  for (let offset = days - 1; offset >= 0; offset--) {
    const date = new Date(now.getFullYear(), now.getMonth(), now.getDate() - offset)
    buckets.push({ key: dayKey(date), date, count: 0 })
  }
  const byKey = new Map(buckets.map((bucket) => [bucket.key, bucket]))
  for (const run of runs) {
    if (!run.created_at) continue
    const created = new Date(run.created_at)
    if (Number.isNaN(created.getTime())) continue
    const bucket = byKey.get(dayKey(created))
    if (bucket) bucket.count += 1
  }
  return buckets
}

export type RecentRuns = { days: DayCount[]; truncated: boolean }

/**
 * The newest runs from the admin list, walked page by page until one is older than the window (the list is
 * newest first), then counted per day. `truncated` says the 500-run cap cut the window short.
 */
export async function fetchRunsByDay(now = new Date()): Promise<RecentRuns> {
  const since = new Date(now.getFullYear(), now.getMonth(), now.getDate() - (RUN_DAYS - 1)).getTime()
  const collected: Array<{ created_at: string | null }> = []
  let truncated = false
  for (let page = 1; page <= MAX_PAGES; page++) {
    const response = await getAdminRuns({ page, page_size: PAGE_SIZE })
    collected.push(...response.items)
    const last = response.items.at(-1)?.created_at
    const reachedEnd = response.items.length < PAGE_SIZE || page * PAGE_SIZE >= response.total
    const olderThanWindow = last ? new Date(last).getTime() < since : true
    if (reachedEnd || olderThanWindow) break
    if (page === MAX_PAGES) truncated = true
  }
  return { days: bucketRunsByDay(collected, RUN_DAYS, now), truncated }
}

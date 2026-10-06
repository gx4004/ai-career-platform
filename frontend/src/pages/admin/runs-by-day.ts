import type { AdminRunsOnDay } from '#/lib/api/admin'

/** The sparkline's window: the server sends this many UTC days. */
export const RUN_DAYS = 14

export type DayCount = { key: string; date: Date; count: number }

/**
 * The server's run series as chart days. A YYYY-MM-DD day is read as that calendar date (local midnight), so its
 * label never shifts a day in a time zone behind UTC.
 */
export function toDayCounts(series: ReadonlyArray<AdminRunsOnDay> | undefined): DayCount[] {
  return (series ?? []).map(({ date, count }) => {
    const [year, month, day] = date.split('-').map(Number)
    return { key: date, date: new Date(year, month - 1, day), count }
  })
}

import { Stat } from '#/components/kit'
import { daysUntil, relativeDays } from '#/components/dashboard/greeting'

/** "Oct 9" in big display type with "in 5 days" under it: a deadline, stamped. */
export function DateStamp({ date, now }: { date: Date; now: Date }) {
  const day = date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
  return <Stat className="dash-date-stamp" size="stamp" value={day} label={relativeDays(daysUntil(date, now))} />
}

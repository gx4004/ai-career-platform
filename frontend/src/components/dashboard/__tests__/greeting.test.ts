import { describe, expect, it } from 'vitest'
import {
  daysUntil,
  greetingLead,
  greetingTitle,
  longDate,
  needsLine,
  partOfDay,
  relativeDays,
} from '#/components/dashboard/greeting'

const at = (hour: number, minute = 0) => new Date(2026, 9, 4, hour, minute)

describe('partOfDay', () => {
  it('splits the day at 04:00, 12:00 and 18:00 by the local clock', () => {
    expect(partOfDay(at(3, 59))).toBe('Evening')
    expect(partOfDay(at(4))).toBe('Morning')
    expect(partOfDay(at(11, 59))).toBe('Morning')
    expect(partOfDay(at(12))).toBe('Afternoon')
    expect(partOfDay(at(17, 59))).toBe('Afternoon')
    expect(partOfDay(at(18))).toBe('Evening')
  })
})

describe('greetingTitle', () => {
  it('uses the first name only, and none when it is not known', () => {
    expect(greetingTitle(at(9), 'Alex Morgan')).toBe('Morning, Alex.')
    expect(greetingTitle(at(9), '  ')).toBe('Morning.')
    expect(greetingTitle(at(14), null)).toBe('Afternoon.')
  })
})

describe('greetingLead', () => {
  const now = at(9)

  // Sign-off r4 chrome-F11: the date broke between the day and the month on phones ("Wednesday 7 / October"): the
  // day and month, and a run's "Oct 2", are joined by no-break spaces.
  it('says how many things need the user, today, and the last runs', () => {
    expect(longDate(now)).toBe('Sunday 4\u00a0October')
    expect(greetingLead(now, { needsTotal: 2, runDates: ['2026-10-02T10:00:00', '2026-10-02T09:00:00'] })).toBe(
      'Two things need you today. Sunday 4\u00a0October; your last two runs were on Oct\u00a02.',
    )
  })

  it('says today and yesterday instead of the date for those days', () => {
    expect(greetingLead(now, { needsTotal: 0, runDates: ['2026-10-04T08:00:00', '2026-10-04T07:00:00'] })).toBe(
      'Nothing needs you today. Sunday 4\u00a0October; your last two runs were today.',
    )
    expect(greetingLead(now, { needsTotal: null, runDates: ['2026-10-04T08:00:00', '2026-10-03T07:00:00'] })).toBe(
      'Sunday 4\u00a0October; your last two runs were today and yesterday.',
    )
    expect(greetingLead(now, { needsTotal: null, runDates: ['2026-10-03T08:00:00', '2026-10-01T07:00:00'] })).toBe(
      'Sunday 4\u00a0October; your last two runs were yesterday and on Oct\u00a01.',
    )
  })

  it('names both days when the last two runs are on different days, and one run alone', () => {
    expect(greetingLead(now, { needsTotal: 1, runDates: ['2026-10-02T10:00:00', '2026-10-01T09:00:00'] })).toBe(
      'One thing needs you today. Sunday 4\u00a0October; your last two runs were on Oct\u00a02 and Oct\u00a01.',
    )
    expect(greetingLead(now, { needsTotal: 0, runDates: ['2026-10-02T10:00:00'] })).toBe(
      'Nothing needs you today. Sunday 4\u00a0October; your last run was on Oct\u00a02.',
    )
  })

  it('leaves the runs clause out with no runs, and the count out while it is unknown', () => {
    expect(greetingLead(now, { needsTotal: 12, runDates: [] })).toBe('12 things need you today. Sunday 4\u00a0October.')
    expect(greetingLead(now, { needsTotal: null, runDates: [] })).toBe('Sunday 4\u00a0October.')
  })
})

describe('needsLine and dates', () => {
  it('pluralises', () => {
    expect(needsLine(0)).toBe('Nothing needs you today.')
    expect(needsLine(1)).toBe('One thing needs you today.')
    expect(needsLine(3)).toBe('Three things need you today.')
  })

  it('counts whole calendar days, not 24-hour spans', () => {
    const now = at(23, 30)
    expect(daysUntil(new Date(2026, 9, 9, 0, 5), now)).toBe(5)
    expect(daysUntil(new Date(2026, 9, 4, 8), now)).toBe(0)
    expect(daysUntil(new Date(2026, 9, 3, 8), now)).toBe(-1)
  })

  it('words them', () => {
    expect([5, 1, 0, -1, -3].map(relativeDays)).toEqual(['in 5 days', 'tomorrow', 'today', 'yesterday', '3 days ago'])
  })
})

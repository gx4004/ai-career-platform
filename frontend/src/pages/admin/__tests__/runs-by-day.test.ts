import { beforeEach, describe, expect, it, vi } from 'vitest'

const getAdminRunsMock = vi.hoisted(() => vi.fn())
vi.mock('#/lib/api/admin', () => ({ getAdminRuns: getAdminRunsMock }))

import { bucketRunsByDay, fetchRunsByDay } from '#/pages/admin/runs-by-day'

const NOW = new Date(2026, 9, 5, 15, 0, 0) // Oct 5, local

describe('bucketRunsByDay', () => {
  it('counts runs into the last 14 calendar days, oldest first, today last', () => {
    const days = bucketRunsByDay(
      [
        { created_at: new Date(2026, 9, 5, 1).toISOString() },
        { created_at: new Date(2026, 9, 5, 9).toISOString() },
        { created_at: new Date(2026, 9, 3, 12).toISOString() },
        { created_at: new Date(2026, 8, 1, 12).toISOString() }, // outside the window
        { created_at: null },
      ],
      14,
      NOW,
    )
    expect(days).toHaveLength(14)
    expect(days.at(-1)!.count).toBe(2)
    expect(days.at(-3)!.count).toBe(1)
    expect(days.reduce((sum, day) => sum + day.count, 0)).toBe(3)
    expect(days[0].date.getDate()).toBe(22)
  })
})

describe('fetchRunsByDay', () => {
  beforeEach(() => getAdminRunsMock.mockReset())

  it('stops at the first page that reaches past the window', async () => {
    getAdminRunsMock.mockResolvedValue({
      items: [{ created_at: new Date(2026, 9, 5, 9).toISOString() }, { created_at: new Date(2026, 8, 1).toISOString() }],
      total: 500,
      page: 1,
      page_size: 100,
    })
    const result = await fetchRunsByDay(NOW)
    expect(getAdminRunsMock).toHaveBeenCalledTimes(1)
    expect(result.truncated).toBe(false)
    expect(result.days.at(-1)!.count).toBe(1)
  })

  it('reports a window the 500-run cap cut short', async () => {
    const recent = Array.from({ length: 100 }, () => ({ created_at: new Date(2026, 9, 5, 9).toISOString() }))
    getAdminRunsMock.mockResolvedValue({ items: recent, total: 5000, page: 1, page_size: 100 })
    const result = await fetchRunsByDay(NOW)
    expect(getAdminRunsMock).toHaveBeenCalledTimes(5)
    expect(result.truncated).toBe(true)
  })
})

import { describe, expect, it } from 'vitest'
import type { ApplicationCard } from '#/lib/api/schemas'
import { cardUrgency, daysUntil, dueText, urgencySortKey } from '../deadlines'

const NOW = new Date('2026-10-05T15:00:00').getTime()
const at = (day: string) => new Date(`${day}T12:00:00`).toISOString()

const card = (patch: Partial<ApplicationCard>): ApplicationCard => ({
  id: 'a', label: null, title: 'Role', company: 'Co', status: 'saved', deadline: null, applied_at: null,
  status_changed_at: null, no_reply_suggested: false, match_score: null, prepared: false, ready: false,
  open_question_count: 0, next_task: null, last_activity_at: null, is_pinned: false, updated_at: at('2026-10-01'),
  ...patch,
})

describe('daysUntil', () => {
  it('counts calendar days, whatever the hour', () => {
    expect(daysUntil(at('2026-10-05'), NOW)).toBe(0)
    expect(daysUntil(at('2026-10-06'), NOW)).toBe(1)
    expect(daysUntil(at('2026-10-03'), NOW)).toBe(-2)
  })
})

describe('dueText', () => {
  it('reads as a sentence, with or without a subject', () => {
    expect(dueText(-3)).toBe('Overdue')
    expect(dueText(0)).toBe('Due today')
    expect(dueText(1)).toBe('Due tomorrow')
    expect(dueText(4)).toBe('Due in 4 days')
    expect(dueText(2, 'Reply')).toBe('Reply due in 2 days')
    expect(dueText(-1, 'Task')).toBe('Task overdue')
  })
})

describe('cardUrgency', () => {
  it('flags an apply-by date within a week and an overdue one', () => {
    expect(cardUrgency(card({ deadline: at('2026-10-07') }), NOW)).toMatchObject({ text: 'Due in 2 days' })
    expect(cardUrgency(card({ deadline: at('2026-10-01') }), NOW)).toMatchObject({ text: 'Overdue' })
  })

  it('ignores a date that is far off, and an apply-by date once applied', () => {
    expect(cardUrgency(card({ deadline: at('2026-11-30') }), NOW)).toBeNull()
    expect(cardUrgency(card({ status: 'applied', deadline: at('2026-10-06') }), NOW)).toBeNull()
  })

  it('flags the reply date of an offer', () => {
    expect(cardUrgency(card({ status: 'offer', deadline: at('2026-10-08') }), NOW)?.text).toBe('Reply due in 3 days')
  })

  it('takes the most pressing of the date and the next task', () => {
    const urgent = cardUrgency(card({ deadline: at('2026-10-10'), next_task: { title: 'Call', deadline: at('2026-10-06') } }), NOW)
    expect(urgent?.text).toBe('Task due tomorrow')
  })

  it('leaves closed applications alone', () => {
    expect(cardUrgency(card({ status: 'rejected', next_task: { title: 'x', deadline: at('2026-10-04') } }), NOW)).toBeNull()
  })
})

describe('urgencySortKey', () => {
  it('puts dated work first, then open questions, ready ones and the rest, and closed last', () => {
    const order = [
      card({ id: 'closed', status: 'rejected' }),
      card({ id: 'nothing' }),
      card({ id: 'ready', ready: true, prepared: true }),
      card({ id: 'questions', open_question_count: 2 }),
      card({ id: 'late', deadline: at('2026-10-20') }),
      card({ id: 'soon', deadline: at('2026-10-06') }),
    ]
    expect(order.sort((a, b) => urgencySortKey(a) - urgencySortKey(b)).map((item) => item.id)).toEqual([
      'soon', 'late', 'questions', 'ready', 'nothing', 'closed',
    ])
  })
})

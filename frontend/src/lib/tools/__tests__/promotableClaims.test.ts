import { describe, expect, it } from 'vitest'
import { getPromotableClaims } from '#/lib/tools/promotableClaims'

describe('getPromotableClaims', () => {
  it('derives one interview-evidence claim per answered question', () => {
    const claims = getPromotableClaims('interview', {
      questions: [
        { question: 'Tell me about a hard bug.', answer: 'I traced a race condition…', focus_area: 'debugging' },
        { question: 'Why this role?', answer: 'The mission aligns…' },
      ],
    })
    expect(claims).toHaveLength(2)
    expect(claims[0]).toMatchObject({
      kind: 'interview-evidence',
      label: 'Tell me about a hard bug.',
      content: { question: 'Tell me about a hard bug.', answer: 'I traced a race condition…', focus_area: 'debugging' },
    })
    // focus_area is optional — omitted when absent rather than stored empty.
    expect(claims[1].content).toEqual({ question: 'Why this role?', answer: 'The mission aligns…' })
    // Keys are per-render handles, never run identifiers.
    expect(claims.map((claim) => claim.key)).toEqual(['interview-0', 'interview-1'])
  })

  it('skips interview questions missing a question or answer', () => {
    const claims = getPromotableClaims('interview', {
      questions: [
        { question: '', answer: 'orphan answer' },
        { question: 'no answer', answer: '' },
        { question: 'kept', answer: 'kept answer' },
      ],
    })
    expect(claims).toHaveLength(1)
    expect(claims[0].content).toEqual({ question: 'kept', answer: 'kept answer' })
  })

  it('derives an achievement claim per cover-letter body paragraph', () => {
    const claims = getPromotableClaims('cover-letter', {
      body_points: [
        { text: 'I shipped a payments platform serving 2M users.', why_this_paragraph: '…' },
        { text: '' },
      ],
    })
    expect(claims).toHaveLength(1)
    expect(claims[0]).toMatchObject({
      kind: 'achievement',
      content: { text: 'I shipped a payments platform serving 2M users.' },
    })
  })

  it('truncates long labels but keeps the full content', () => {
    const long = 'x'.repeat(200)
    const [claim] = getPromotableClaims('cover-letter', { body_points: [{ text: long }] })
    expect(claim.label.length).toBeLessThanOrEqual(90)
    expect(claim.label.endsWith('…')).toBe(true)
    expect(claim.content.text).toBe(long)
  })

  it('returns nothing for tools without reusable claims or malformed payloads', () => {
    expect(getPromotableClaims('resume', { overall_score: 80 })).toEqual([])
    expect(getPromotableClaims('job-match', {})).toEqual([])
    expect(getPromotableClaims('interview', {})).toEqual([])
    expect(getPromotableClaims('interview', { questions: 'not-an-array' })).toEqual([])
    expect(getPromotableClaims('cover-letter', { body_points: [null, 42, 'x'] })).toEqual([])
  })
})

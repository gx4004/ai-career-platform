import { describe, expect, it } from 'vitest'
import { formatRunDate, runSubject } from '#/lib/tools/runLabel'
import { tools } from '#/lib/tools/registry'

describe('runSubject', () => {
  it('drops the score and the tool name the page already shows', () => {
    expect(runSubject('Resume Analysis (77/100)', tools.resume)).toBe('')
    expect(runSubject('Job Match (75%)', tools['job-match'])).toBe('')
    expect(runSubject('Resume Analyzer', tools.resume)).toBe('')
    expect(runSubject('Resume demo', tools.resume)).toBe('')
  })

  it('keeps what the run is about', () => {
    expect(runSubject('Career Plan (Engineering Manager)', tools.career)).toBe('Engineering Manager')
    expect(runSubject('Portfolio Roadmap (Senior Backend Engineer)', tools.portfolio)).toBe('Senior Backend Engineer')
    expect(runSubject('Cover Letter (Professional)', tools['cover-letter'])).toBe('Professional')
  })

  it('does not repeat a question count', () => {
    expect(runSubject('Interview Prep (6 questions)', tools.interview)).toBe('')
    expect(runSubject('Interview Prep (1 question)', tools.interview)).toBe('')
  })

  it('shows a label the user renamed whole', () => {
    expect(runSubject('Backend application', tools.resume)).toBe('Backend application')
    expect(runSubject('Backend application (77/100)', tools.resume)).toBe('Backend application')
  })

  it('handles missing labels', () => {
    expect(runSubject(null, tools.resume)).toBe('')
    expect(runSubject('   ', tools.resume)).toBe('')
  })
})

describe('formatRunDate', () => {
  const now = new Date(2026, 9, 3)

  it('omits the year for the current year', () => {
    expect(formatRunDate(new Date(2026, 8, 5), now)).toMatch(/^Sep 5$|^5 Sep$/)
  })

  it('adds the year for an older run', () => {
    expect(formatRunDate(new Date(2025, 11, 24), now)).toContain('2025')
  })

  it('returns an empty string for an invalid date', () => {
    expect(formatRunDate('nope', now)).toBe('')
  })
})

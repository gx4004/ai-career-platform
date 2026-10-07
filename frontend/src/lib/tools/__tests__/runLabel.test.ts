import { describe, expect, it } from 'vitest'
import { formatRunDate, formatRunDay, runSubject } from '#/lib/tools/runLabel'
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

  // tool-inputs-F29: a label that names its job ("<Tool>: <job> (<detail>)") gives the job, so runs of the same tool
  // can be told apart in the Recent runs rail and the report header; the tool name and score stay off it.
  it('reads the job a subject-carrying label names after the tool name', () => {
    expect(runSubject('Job Match: Senior Backend Engineer at Northwind Labs (75%)', tools['job-match'])).toBe(
      'Senior Backend Engineer at Northwind Labs',
    )
    expect(runSubject('Resume Analysis: Staff Engineer (77/100)', tools.resume)).toBe('Staff Engineer')
    expect(runSubject('Cover Letter: Senior Backend Engineer (Professional)', tools['cover-letter'])).toBe(
      'Senior Backend Engineer (Professional)',
    )
    expect(runSubject('Interview Prep: Senior Backend Engineer (5 questions)', tools.interview)).toBe(
      'Senior Backend Engineer',
    )
    expect(runSubject('Job Match: (75%)', tools['job-match'])).toBe('')
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

  it('writes the English short date whatever the browser locale (the app is English only)', () => {
    expect(formatRunDate(new Date(2026, 8, 5), now)).toBe('Sep 5')
  })
})

describe('formatRunDay', () => {
  const now = new Date(2026, 9, 3, 9, 30)

  it('says Today and Yesterday by the local calendar, then the date', () => {
    expect(formatRunDay(new Date(2026, 9, 3, 0, 5), now)).toBe('Today')
    expect(formatRunDay(new Date(2026, 9, 2, 23, 50), now)).toBe('Yesterday')
    expect(formatRunDay(new Date(2026, 9, 1, 12), now)).toBe('Oct 1')
    expect(formatRunDay('nope', now)).toBe('')
  })
})

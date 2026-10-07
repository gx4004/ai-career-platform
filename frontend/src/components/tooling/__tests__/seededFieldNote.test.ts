import { describe, expect, it } from 'vitest'
import { getSeededFieldNote } from '#/components/tooling/toolPageShared'

const JD = 'Senior Backend Engineer, Platform at Northwind Labs\n\nWe are hiring a backend engineer.'

describe('getSeededFieldNote', () => {
  it('names the application a job description came from, and that the run is saved to it', () => {
    const bridge = {
      seededJob: true,
      seededTargetRole: false,
      carriedJobDescription: JD,
      jobApplicationLabel: 'Senior Backend Engineer, Platform at Northwind Labs',
    }
    expect(getSeededFieldNote('jobDescription', bridge, JD)).toBe(
      'Job description from your application Senior Backend Engineer, Platform at Northwind Labs. This run is saved to it.',
    )
  })

  it('keeps the generic note for a value carried from another tool, and none once the user replaced it', () => {
    const bridge = { seededJob: true, seededTargetRole: false, carriedJobDescription: JD }
    expect(getSeededFieldNote('jobDescription', bridge, JD)).toBe('Job description carried in from your recent workflow.')
    expect(getSeededFieldNote('jobDescription', { ...bridge, jobApplicationLabel: 'X' }, 'my own text')).toBe('')
  })

  // Sign-off tool-inputs-F30: a re-generated run's role is that run's, not "from your recent workflow".
  it('names the run being re-generated as the source of its target role', () => {
    const bridge = { seededJob: false, seededTargetRole: true, carriedTargetRole: 'Staff Backend Engineer' }
    expect(getSeededFieldNote('targetRole', { ...bridge, roleFromRun: 'target' }, 'Staff Backend Engineer')).toBe(
      'Target role from the run you are re-generating.',
    )
    expect(getSeededFieldNote('targetRole', { ...bridge, roleFromRun: 'recommended' }, 'Staff Backend Engineer')).toBe(
      'The role the run you are re-generating recommended.',
    )
    expect(getSeededFieldNote('targetRole', bridge, 'Staff Backend Engineer')).toBe('Target role carried in from your recent workflow.')
  })
})

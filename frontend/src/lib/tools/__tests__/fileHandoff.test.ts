import { describe, expect, it } from 'vitest'
import { retrieveFile, stashFile } from '#/lib/tools/fileHandoff'

function fakeFile(name = 'resume.pdf') {
  return new File(['hello'], name, { type: 'application/pdf' })
}

describe('fileHandoff', () => {
  it('round-trips a file through stash + retrieve', () => {
    const file = fakeFile()
    const id = stashFile(file)
    expect(id).toMatch(/^handoff-\d+-\d+$/)

    const back = retrieveFile(id)
    expect(back).toBe(file)
  })

  it('deletes the entry after retrieval', () => {
    const file = fakeFile()
    const id = stashFile(file)
    retrieveFile(id)
    expect(retrieveFile(id)).toBeNull()
  })

  it('returns null for unknown ids', () => {
    expect(retrieveFile('does-not-exist')).toBeNull()
  })

  it('returns distinct ids for separate stashes', () => {
    const a = stashFile(fakeFile('a.pdf'))
    const b = stashFile(fakeFile('b.pdf'))
    expect(a).not.toBe(b)
  })
})

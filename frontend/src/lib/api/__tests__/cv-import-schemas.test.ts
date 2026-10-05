import { describe, expect, it } from 'vitest'
import { cvImportAcceptSchema } from '../schemas'

const proposal = {
  filename: 'resume.txt',
  import_id: '123e4567-e89b-42d3-a456-426614174000',
  name: 'Imported CV',
  sections: [{
    id: 'section-summary', kind: 'summary', title: 'Summary', visible: true, position: 0,
    entries: [{ id: 'entry-summary-0', body: 'Platform engineer', position: 0, claim: null }],
  }],
  warnings: [],
  header: { name: null, headline: null, email: null, phone: null, location: null, links: [] },
}

describe('CV import contract', () => {
  it('accepts the reviewed proposal unchanged', () => {
    expect(cvImportAcceptSchema.parse(proposal)).toEqual(proposal)
  })

  it('rejects a claim that tries to change imported provenance', () => {
    expect(() => cvImportAcceptSchema.parse({
      ...proposal,
      sections: [{ ...proposal.sections[0], entries: [{
        ...proposal.sections[0].entries[0], claim: {
          kind: 'experience', content: { statement: 'Platform engineer' }, provenance: 'user-entered',
        },
      }] }],
    })).toThrow()
  })
})

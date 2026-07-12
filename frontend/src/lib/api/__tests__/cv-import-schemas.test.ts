import { describe, expect, it } from 'vitest'
import { cvImportAcceptSchema, cvImportProposalSchema } from '../schemas'

const proposal = {
  filename: 'resume.txt',
  import_id: '123e4567-e89b-42d3-a456-426614174000',
  name: 'Imported CV',
  sections: [{
    id: 'section-summary', kind: 'summary', title: 'Summary', visible: true, position: 0,
    entries: [{
      id: 'entry-summary-0', body: 'Platform engineer', position: 0,
      claim: null,
    }],
  }],
  warnings: [],
}

describe('CV import contracts', () => {
  it('validates the mirrored reviewable proposal and accept payload', () => {
    expect(cvImportProposalSchema.parse(proposal)).toEqual(proposal)
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

  it('requires the same explicit fields as the backend contract', () => {
    const { warnings: _warnings, ...withoutWarnings } = proposal
    expect(() => cvImportAcceptSchema.parse(withoutWarnings)).toThrow()
    expect(() => cvImportAcceptSchema.parse({
      ...proposal, import_id: '123e4567e89b42d3a456426614174000',
    })).toThrow()
  })
})

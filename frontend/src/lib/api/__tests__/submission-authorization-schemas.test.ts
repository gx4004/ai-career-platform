import { describe, expect, it } from 'vitest'
import {
  submissionAuthorizationListSchema,
  submissionAuthorizationsExportSchema,
} from '#/lib/api/submissionAuthorizationSchemas'

const grant = {
  id: 'grant-1',
  source_id: 'source-1',
  source_key: 'synthetic-ats',
  source_display_name: 'Synthetic ATS',
  source_family: 'employer_ats',
  mechanism: 'oauth2_authorization_code',
  scope: 'submit_applications',
  granted_at: '2026-07-25T12:00:00Z',
}

describe('submission authorization contracts', () => {
  it('mirrors the bounded backend list and export shapes', () => {
    expect(
      submissionAuthorizationListSchema.parse({ items: [grant] }).items[0],
    ).toEqual(grant)
    expect(
      submissionAuthorizationsExportSchema.parse({
        schema_version: 'submission-authorizations-export/v1',
        grant_count: 1,
        grants: [grant],
      }).grant_count,
    ).toBe(1)
  })

  it('rejects credential fields, unsupported mechanisms, and mismatched counts', () => {
    expect(
      submissionAuthorizationListSchema.safeParse({
        items: [{ ...grant, access_token: 'must-never-enter-the-client-contract' }],
      }).success,
    ).toBe(false)
    expect(
      submissionAuthorizationListSchema.safeParse({
        items: [{ ...grant, mechanism: 'copied_session_cookie' }],
      }).success,
    ).toBe(false)
    expect(
      submissionAuthorizationsExportSchema.safeParse({
        schema_version: 'submission-authorizations-export/v1',
        grant_count: 0,
        grants: [grant],
      }).success,
    ).toBe(false)
  })
})

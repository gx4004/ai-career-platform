import { describe, expect, it } from 'vitest'
import {
  applicationDetailSchema,
  applicationCreateSchema,
  applicationDetailsUpdateSchema,
  applicationListSchema,
  applicationStatusSchema,
  applicationUpdateSchema,
  careerDataExportSchema,
  importJobTextSchema,
  importJobUrlSchema,
  workspaceUpdateSchema,
} from '#/lib/api/schemas'

const card = {
  id: 'app-1', label: null, title: 'Engineer', company: 'Example Corp', status: 'saved', deadline: null,
  applied_at: null, match_score: 74, prepared: true, ready: false, open_question_count: 1,
  next_task: { title: 'Follow up', deadline: '2026-09-30T12:00:00+02:00' },
  last_activity_at: '2026-09-20T10:00:00Z', is_pinned: false, updated_at: '2026-09-20T10:00:00Z',
}
const listing = {
  title: 'Engineer', company: 'Example Corp', description: 'Build APIs', source_url: null,
  apply_url: 'https://careers.example.com/apply', retrieved_at: '2026-09-19T10:00:00Z',
}

describe('application contracts', () => {
  it('parses the board and the application page responses', () => {
    expect(applicationListSchema.parse({ items: [card], total: 1 }).items[0].open_question_count).toBe(1)
    const detail = applicationDetailSchema.parse({
      ...card, role: 'Engineer', listing, notes: 'Recruiter: Tom',
      selected_materials: { cv_variant: null, cover_letter: null, interview: null },
      available_materials: { cv_variants: [], cover_letters: [], interviews: [] },
      drafts: { run_id: 'run-1', created_at: '2026-09-20T10:00:00Z', cover_letter: null, screening_answers: [] },
      open_questions: [{ key: 'q-1', question: 'Salary?', category: 'salary', answered: false }],
      answers: {}, tasks: [],
      events: [{ id: 'e-1', event_type: 'prepared', details: { open_question_count: 1 }, provenance: 'user', created_at: '2026-09-20T10:00:00+02:00' }],
      snapshot: null,
    })
    expect(detail.listing?.apply_url).toBe('https://careers.example.com/apply')
  })

  it('knows only the seven statuses; history edits are label and pin only', () => {
    expect(applicationStatusSchema.options).toEqual(['saved', 'applied', 'no_reply', 'interviewing', 'offer', 'rejected', 'withdrawn'])
    expect(applicationStatusSchema.safeParse('planning').success).toBe(false)
    expect(applicationUpdateSchema.safeParse({}).success).toBe(false)
    expect(applicationUpdateSchema.safeParse({ deadline: '2026-08-15T16:00:00' }).success).toBe(false)
    expect(workspaceUpdateSchema.safeParse({ status: 'applied' }).success).toBe(false)
  })

  it('mirrors applications in career-data-export/v1', () => {
    const parsed = careerDataExportSchema.parse({
      schema_version: 'career-data-export/v1', exported_at: '2026-09-20T10:00:00Z',
      item_count: 0, items: [],
      cv_documents: { schema_version: 'cv-documents-export/v1', exported_at: '2026-09-20T10:00:00Z', document_count: 0, documents: [] },
      personalization: { dismissals: [] },
      development: { item_count: 0, items: [], classification_count: 0, classifications: [], recommendation_count: 0, recommendations: [] },
      applications: {
        application_count: 1,
        applications: [{
          id: 'app-1', label: null, is_pinned: false, company: 'Example Corp', role: 'Engineer', status: 'applied',
          deadline: null, applied_at: '2026-09-21T10:00:00Z', match_score: 74, notes: null,
          open_questions: [], answers: {}, created_at: '2026-09-19T10:00:00Z', updated_at: '2026-09-21T10:00:00Z',
          listing, listing_revisions: [listing], selected_cv_variant_id: null, selected_cover_letter: null,
          selected_interview: null, drafts: null, tasks: [], snapshot: null,
          events: [{ id: 'e-1', event_type: 'applied', details: { snapshot_id: 's-1' }, created_at: '2026-09-21T10:00:00Z' }],
        }],
        preferences: null,
      },
    })
    expect(parsed.applications.applications[0].events[0].event_type).toBe('applied')
    expect(careerDataExportSchema.safeParse({ ...parsed, campaigns: {} }).success).toBe(false)
  })

  it('mirrors bounded strict pasted-listing inputs', () => {
    expect(importJobTextSchema.parse({
      campaign_id: 'ws-1', job_title: 'Engineer', company_name: 'Example Corp',
      job_description: 'A sufficiently detailed pasted role description.',
    }).campaign_id).toBe('ws-1')
    expect(importJobTextSchema.safeParse({
      campaign_id: 'ws-1', job_title: 'Engineer', company_name: 'Example Corp',
      job_description: 'too short', source_url: 'https://example.com',
    }).success).toBe(false)
    expect(importJobUrlSchema.safeParse({ url: 'file:///private/job' }).success).toBe(false)
    expect(importJobUrlSchema.safeParse({ url: `https://example.com/${'x'.repeat(2_100)}` }).success).toBe(false)
  })
})

describe('application details update contract', () => {
  const base = {
    full_name: '', email: '', phone: '', linkedin: '', website: '', location: '',
    work_authorization: '', visa_sponsorship: '', notice_period: '', salary_expectation: '', relocation: '',
  }
  it('accepts empty, bare-host and http(s) links and an email', () => {
    for (const link of ['', 'linkedin.com/in/ada', 'https://ada.dev', 'localhost:3000/me', 'ada.dev:8080/x']) {
      expect(applicationDetailsUpdateSchema.safeParse({ ...base, linkedin: link, website: link }).success).toBe(true)
    }
    expect(applicationDetailsUpdateSchema.safeParse({ ...base, email: 'ada@example.com' }).success).toBe(true)
  })
  it('rejects script schemes and a malformed email like the API does', () => {
    for (const link of ['javascript:alert(1)', 'javascript:1/alert(1)', 'javascript:0', 'data:1/x', 'ftp://a.dev', 'a b.dev']) {
      expect(applicationDetailsUpdateSchema.safeParse({ ...base, website: link }).success).toBe(false)
    }
    expect(applicationDetailsUpdateSchema.safeParse({ ...base, email: 'not-an-email' }).success).toBe(false)
  })
  it('checks the phone shape like the API does', () => {
    for (const phone of ['', '+44 20 7946 0958', '(415) 555-0132', '020 7946 0958 ext. 12']) {
      expect(applicationDetailsUpdateSchema.safeParse({ ...base, phone }).success).toBe(true)
    }
    for (const phone of ['call me maybe', '12', '+1 (555) 12345678901234567890']) {
      expect(applicationDetailsUpdateSchema.safeParse({ ...base, phone }).success).toBe(false)
    }
  })
})

describe('application create contract', () => {
  const body = { role: 'Data Engineer', company: 'Fjord' }
  it('accepts a web address or none, and refuses other schemes', () => {
    expect(applicationCreateSchema.safeParse({ ...body, source_url: 'https://fjord.example/jobs/1' }).success).toBe(true)
    expect(applicationCreateSchema.safeParse({ ...body, source_url: null }).success).toBe(true)
    expect(applicationCreateSchema.safeParse({ ...body, source_url: 'javascript:alert(1)' }).success).toBe(false)
  })
})

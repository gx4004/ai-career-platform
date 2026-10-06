import { beforeEach, describe, expect, it, vi } from 'vitest'

const listCvDocuments = vi.fn()
const getApplication = vi.fn()
vi.mock('#/lib/api/client', () => ({
  listCvDocuments: () => listCvDocuments(),
  getApplication: (id: string) => getApplication(id),
}))

import { cvDocumentText, seedRegenerate } from '#/lib/tools/regenerateSeed'
import { readWorkflowContext } from '#/lib/tools/drafts'
import type { ToolRunDetail } from '#/lib/api/schemas'

const entry = (body: string, extra: Record<string, unknown> = {}) => ({ id: body, evidence_item_id: null, body, position: 0, ...extra })
const doc = (name: string, updated_at: string) => ({
  id: name, name, updated_at,
  header: { name: 'Alex Morgan', headline: 'Platform engineer', email: 'alex@example.com', phone: null, location: 'Berlin', links: [] },
  sections: [
    { id: 's2', kind: 'skills', title: 'Skills', visible: true, position: 1, entries: [entry('Python, Go, Kubernetes, PostgreSQL')] },
    { id: 's1', kind: 'experience', title: 'Experience', visible: true, position: 0, entries: [entry('Led the billing platform migration.', { heading: 'Staff Engineer', subheading: 'Northwind', start_date: '2021', end_date: 'Present', bullets: ['Cut deploy time 40%'] })] },
    { id: 's3', kind: 'custom', title: 'Hidden', visible: false, position: 2, entries: [entry('secret')] },
  ],
})
const run = (workspace: ToolRunDetail['workspace'] = null) => ({ id: 'run-1', workspace }) as unknown as ToolRunDetail

beforeEach(() => {
  window.sessionStorage.clear()
  listCvDocuments.mockReset()
  getApplication.mockReset()
})

describe('cvDocumentText', () => {
  it('writes visible sections in order with header, dates and bullets', () => {
    const text = cvDocumentText(doc('CV', '2026-10-01T00:00:00Z') as never)
    expect(text.startsWith('Alex Morgan\nPlatform engineer\nalex@example.com · Berlin')).toBe(true)
    expect(text.indexOf('Experience')).toBeLessThan(text.indexOf('Skills'))
    expect(text).toContain('Staff Engineer, Northwind · 2021 – Present')
    expect(text).toContain('- Cut deploy time 40%')
    expect(text).not.toContain('secret')
  })
})

describe('seedRegenerate', () => {
  it('fills the resume from the newest CV and the job from the run’s application', async () => {
    listCvDocuments.mockResolvedValue({ items: [doc('Old CV', '2026-01-01T00:00:00Z'), doc('Platform CV', '2026-10-01T00:00:00Z')] })
    getApplication.mockResolvedValue({ listing: { title: 'Staff Engineer', company: 'Northwind', description: 'Own the platform. Python and Go.' } })
    await seedRegenerate(run({ id: 'app-1', label: 'Staff Engineer at Northwind', company: 'Northwind', role: 'Staff Engineer' } as never), 'job-match')
    const context = readWorkflowContext()
    expect(context?.resumeSource).toBe('your CV Studio CV “Platform CV”')
    expect(context?.resumeText).toContain('Alex Morgan')
    expect(context?.jobDescription).toBe('Staff Engineer at Northwind\n\nOwn the platform. Python and Go.')
    expect(getApplication).toHaveBeenCalledWith('app-1')
  })

  it('asks for nothing it already has and survives failing lookups', async () => {
    listCvDocuments.mockRejectedValue(new Error('401'))
    await seedRegenerate(run(), 'job-match')
    expect(readWorkflowContext()?.resumeText).toBeUndefined()
    expect(getApplication).not.toHaveBeenCalled()
  })

  it('does not look up a job for tools without a job description', async () => {
    listCvDocuments.mockResolvedValue({ items: [] })
    await seedRegenerate(run({ id: 'app-1' } as never), 'career')
    expect(getApplication).not.toHaveBeenCalled()
  })
})

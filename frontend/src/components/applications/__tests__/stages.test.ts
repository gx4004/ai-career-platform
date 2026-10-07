import { describe, expect, it } from 'vitest'
import { roleOnly, sentRecordedLate, stageTone } from '#/components/applications/stages'

describe('roleOnly', () => {
  it('strips a trailing company from a stored label', () => {
    expect(roleOnly('Platform Engineer at Acme Systems', 'Acme Systems')).toBe('Platform Engineer')
    expect(roleOnly('SRE @ Acme (EU)', 'Acme (EU)')).toBe('SRE')
  })
  it('leaves other titles alone', () => {
    expect(roleOnly('Engineer at Scale', 'Acme')).toBe('Engineer at Scale')
    expect(roleOnly('Acme', 'Acme')).toBe('Acme')
  })
})

describe('stageTone', () => {
  it('uses the kit badge tones: accent while a conversation is open, success for an offer, quiet otherwise', () => {
    expect(stageTone('offer')).toBe('success')
    expect(stageTone('applied')).toBe('accent')
    expect(stageTone('interviewing')).toBe('accent')
    expect(stageTone('saved')).toBe('neutral')
    expect(stageTone('rejected')).toBe('neutral')
  })
})

describe('sentRecordedLate', () => {
  const event = (event_type: string, created_at: string, to?: string) => ({
    id: `${event_type}-${created_at}`, event_type, details: to ? { to } : {}, provenance: 'user' as const, created_at,
  })
  it('is false when nothing was recorded, or when Mark as applied moved the card to Applied in the same moment', () => {
    expect(sentRecordedLate({ applied_at: null, status_changed_at: null, events: [] })).toBe(false)
    expect(sentRecordedLate({
      applied_at: '2026-09-21T09:00:00Z', status_changed_at: '2026-09-24T09:00:00Z',
      events: [event('applied', '2026-09-21T09:00:00Z'), event('status_changed', '2026-09-21T09:00:00.100Z', 'applied')],
    })).toBe(false)
  })
  it('is true when the freeze has no move to Applied beside it', () => {
    expect(sentRecordedLate({
      applied_at: '2026-09-25T09:00:00Z', status_changed_at: '2026-09-28T09:00:00Z',
      events: [event('status_changed', '2026-09-22T09:00:00Z', 'interviewing'), event('applied', '2026-09-25T09:00:00Z')],
    })).toBe(true)
  })
  it('falls back to the dates when the freeze is older than the events the detail carries', () => {
    expect(sentRecordedLate({ applied_at: '2026-09-25T09:00:00Z', status_changed_at: '2026-09-22T09:00:00Z', events: [] })).toBe(true)
    expect(sentRecordedLate({ applied_at: '2026-09-21T09:00:00Z', status_changed_at: '2026-09-21T09:00:00Z', events: [] })).toBe(false)
  })
})

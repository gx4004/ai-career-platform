import { describe, expect, it } from 'vitest'
import {
  formatExportContent,
  readEditableBlocks,
  readExportableSections,
  sanitizeDownloadTitle,
} from '#/lib/tools/exports'

describe('exports helpers', () => {
  it('formats exportable sections as plain text and markdown', () => {
    const payload = {
      exportable_sections: [
        {
          id: 'summary',
          title: 'Application brief',
          body: 'Strong backend baseline with one clear infrastructure gap.',
          items: ['Match score: 68%', 'Verdict: borderline'],
        },
      ],
    }

    const sections = readExportableSections(payload)
    expect(formatExportContent(sections, 'txt')).toContain('APPLICATION BRIEF')
    expect(formatExportContent(sections, 'md')).toContain('## Application brief')
    expect(formatExportContent(sections, 'md')).toContain('- Match score: 68%')
  })

  it('normalizes editable blocks and stable filenames', () => {
    const payload = {
      editable_blocks: [
        {
          id: 'draft',
          label: 'Full draft',
          content: 'Dear Hiring Manager...',
        },
      ],
    }

    expect(readEditableBlocks(payload)).toHaveLength(1)
    expect(sanitizeDownloadTitle('Interview Practice Packet', 'md')).toBe(
      'interview-practice-packet.md',
    )
  })
})

import type { CvEntry, CvSection } from '#/lib/api/schemas'

export const sectionLabels: Record<CvSection['kind'], string> = {
  summary: 'Summary', experience: 'Experience', achievements: 'Achievements', skills: 'Skills',
  education: 'Education', projects: 'Projects', certifications: 'Certifications',
  'interview-evidence': 'Interview evidence', custom: 'Custom section',
}

const id = (prefix: string) => `${prefix}-${crypto.randomUUID()}`

export function normalizeSections(sections: CvSection[]): CvSection[] {
  return sections.map((section, position) => ({
    ...section, position,
    entries: section.entries.map((entry, entryPosition) => ({ ...entry, position: entryPosition })),
  }))
}

export function addSection(sections: CvSection[], kind: CvSection['kind']): CvSection[] {
  return normalizeSections([...sections, {
    id: id('section'), kind, title: sectionLabels[kind], visible: true,
    position: sections.length, entries: [],
  }])
}

export function addEntry(sections: CvSection[], sectionId: string): CvSection[] {
  return sections.map((section) => section.id === sectionId ? {
    ...section,
    entries: [...section.entries, {
      id: id('entry'), evidence_item_id: null, body: 'New entry', position: section.entries.length,
    } satisfies CvEntry],
  } : section)
}

export function moveSection(sections: CvSection[], index: number, delta: -1 | 1): CvSection[] {
  const target = index + delta
  if (target < 0 || target >= sections.length) return sections
  const next = [...sections]
  ;[next[index], next[target]] = [next[target], next[index]]
  return normalizeSections(next)
}

export function moveEntry(sections: CvSection[], sectionId: string, index: number, delta: -1 | 1): CvSection[] {
  return normalizeSections(sections.map((section) => {
    if (section.id !== sectionId) return section
    const target = index + delta
    if (target < 0 || target >= section.entries.length) return section
    const entries = [...section.entries]
    ;[entries[index], entries[target]] = [entries[target], entries[index]]
    return { ...section, entries }
  }))
}

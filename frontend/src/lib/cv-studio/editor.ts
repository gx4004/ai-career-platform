import type { CvEntry, CvSection } from '#/lib/api/schemas'

export const sectionLabels: Record<CvSection['kind'], string> = {
  summary: 'Summary', experience: 'Experience', achievements: 'Achievements', skills: 'Skills',
  education: 'Education', projects: 'Projects', certifications: 'Certifications',
  'interview-evidence': 'Interview stories', custom: 'Custom section',
}

/** Sections whose entries are edited as cards (role, organisation, dates, bullets). */
export const STRUCTURED_KINDS: ReadonlySet<CvSection['kind']> = new Set(['experience', 'education', 'projects'])
export const isStructuredKind = (kind: CvSection['kind']) => STRUCTURED_KINDS.has(kind)

export const MAX_BULLETS = 30

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

export function removeSection(sections: CvSection[], sectionId: string): CvSection[] {
  return normalizeSections(sections.filter((section) => section.id !== sectionId))
}

export function addEntry(sections: CvSection[], sectionId: string): CvSection[] {
  return sections.map((section) => {
    if (section.id !== sectionId) return section
    const entry: CvEntry = isStructuredKind(section.kind)
      ? { id: id('entry'), evidence_item_id: null, body: '', position: section.entries.length, heading: '', subheading: '', location: '', start_date: '', end_date: '', bullets: [''] }
      : { id: id('entry'), evidence_item_id: null, body: '', position: section.entries.length }
    return { ...section, entries: [...section.entries, entry] }
  })
}

export function removeEntry(sections: CvSection[], sectionId: string, entryId: string): CvSection[] {
  return normalizeSections(sections.map((section) => section.id === sectionId
    ? { ...section, entries: section.entries.filter((entry) => entry.id !== entryId) }
    : section))
}

export function moveSection(sections: CvSection[], index: number, delta: -1 | 1): CvSection[] {
  return moveSectionTo(sections, index, index + delta)
}

/** Drag-and-drop reorder: take the section at `from` and insert it at `to`. */
export function moveSectionTo(sections: CvSection[], from: number, to: number): CvSection[] {
  if (from === to || from < 0 || to < 0 || from >= sections.length || to >= sections.length) return sections
  const next = [...sections]
  const [moved] = next.splice(from, 1)
  next.splice(to, 0, moved)
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

const filledBullets = (entry: CvEntry) => (entry.bullets ?? []).map((bullet) => bullet.trim()).filter(Boolean)

/**
 * `body` stays the canonical text of an entry: tailoring matches suggestions
 * against it and quality scoring reads it. For a card with bullet points the
 * rule is `body = bullets joined by newlines`; without bullets, `body` is the
 * free description the person typed.
 */
function syncBody(entry: CvEntry): CvEntry {
  const bullets = filledBullets(entry)
  return bullets.length > 0 ? { ...entry, body: bullets.join('\n') } : entry
}

export function updateEntry(
  sections: CvSection[], sectionId: string, entryId: string, patch: Partial<Omit<CvEntry, 'id' | 'position'>>,
): CvSection[] {
  return sections.map((section) => section.id !== sectionId ? section : {
    ...section,
    entries: section.entries.map((entry) => entry.id === entryId ? syncBody({ ...entry, ...patch }) : entry),
  })
}

function editBullets(
  sections: CvSection[], sectionId: string, entryId: string, change: (bullets: string[], entry: CvEntry) => string[],
) {
  return sections.map((section) => section.id !== sectionId ? section : {
    ...section,
    entries: section.entries.map((entry) => entry.id === entryId
      ? syncBody({ ...entry, bullets: change([...(entry.bullets ?? [])], entry) })
      : entry),
  })
}

/** Adds an empty bullet. The first bullet adopts an existing description so no text is lost. */
export function addBullet(sections: CvSection[], sectionId: string, entryId: string): CvSection[] {
  return editBullets(sections, sectionId, entryId, (bullets, entry) => {
    if (bullets.length >= MAX_BULLETS) return bullets
    if (bullets.length === 0) {
      const description = entry.body.trim()
      const seeded = description && description !== (entry.heading ?? '').trim()
        ? description.split('\n').map((line) => line.trim()).filter(Boolean)
        : []
      return [...seeded, ''].slice(0, MAX_BULLETS)
    }
    return [...bullets, '']
  })
}

export function updateBullet(sections: CvSection[], sectionId: string, entryId: string, index: number, value: string) {
  return editBullets(sections, sectionId, entryId, (bullets) => bullets.map((bullet, i) => i === index ? value : bullet))
}

export function removeBullet(sections: CvSection[], sectionId: string, entryId: string, index: number) {
  return editBullets(sections, sectionId, entryId, (bullets) => bullets.filter((_, i) => i !== index))
}

export function moveBullet(sections: CvSection[], sectionId: string, entryId: string, index: number, delta: -1 | 1) {
  return editBullets(sections, sectionId, entryId, (bullets) => {
    const target = index + delta
    if (target < 0 || target >= bullets.length) return bullets
    ;[bullets[index], bullets[target]] = [bullets[target], bullets[index]]
    return bullets
  })
}

const OPTIONAL_TEXT_FIELDS = ['heading', 'subheading', 'location', 'start_date', 'end_date'] as const

/**
 * Shape the local draft into what the API accepts: empty optional fields become
 * `null`, blank bullets are dropped, and an entry with no text at all is left
 * out (it stays in the local draft so the person can keep typing).
 */
export function toSavableSections(sections: CvSection[]): CvSection[] {
  return normalizeSections(sections.map((section) => ({
    ...section,
    title: section.title.trim() || sectionLabels[section.kind],
    entries: section.entries.flatMap((entry) => {
      const cleaned: CvEntry = { ...entry }
      for (const field of OPTIONAL_TEXT_FIELDS) {
        const value = entry[field]
        if (value === undefined) continue
        cleaned[field] = value && value.trim() ? value.trim() : null
      }
      if (entry.bullets !== undefined) cleaned.bullets = filledBullets(entry)
      const bullets = cleaned.bullets ?? []
      const body = bullets.length > 0
        ? bullets.join('\n')
        : entry.body.trim() || cleaned.heading || cleaned.subheading || ''
      if (!body) return []
      return [{ ...cleaned, body: body.slice(0, 5_000) }]
    }),
  })))
}

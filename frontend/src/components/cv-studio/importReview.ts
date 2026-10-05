import type { CvImportProposal } from '#/lib/api/schemas'

export type ImportSection = CvImportProposal['sections'][number]
export type ImportEntry = ImportSection['entries'][number]

const renumber = (sections: ImportSection[]): ImportSection[] => sections.map((section, position) => ({
  ...section, position,
  entries: section.entries.map((entry, entryPosition) => ({ ...entry, position: entryPosition })),
}))

const withSection = (proposal: CvImportProposal, sectionId: string, change: (section: ImportSection) => ImportSection): CvImportProposal => ({
  ...proposal,
  sections: proposal.sections.map((section) => section.id === sectionId ? change(section) : section),
})

/** The lines an entry carries: its highlights, or its body when it has none. */
const linesOf = (entry: ImportEntry) => entry.bullets?.length ? entry.bullets : entry.body.split('\n').filter((line) => line.trim())

export function updateImportEntry(proposal: CvImportProposal, sectionId: string, entryId: string, patch: Partial<ImportEntry>): CvImportProposal {
  return withSection(proposal, sectionId, (section) => ({
    ...section, entries: section.entries.map((entry) => entry.id === entryId ? { ...entry, ...patch } : entry),
  }))
}

/** Take an entry out of the CV (the review's way to drop a stray line the reader mistook for an entry). */
export function removeImportEntry(proposal: CvImportProposal, sectionId: string, entryId: string): CvImportProposal {
  return { ...proposal, sections: renumber(proposal.sections.map((section) => section.id === sectionId
    ? { ...section, entries: section.entries.filter((entry) => entry.id !== entryId) }
    : section)) }
}

/**
 * Fold an entry into the one above it: the reader sometimes splits one role in two. The lines of the
 * lower entry become highlights of the upper one; its own heading is kept as the first highlight when it has one.
 */
export function mergeIntoPrevious(proposal: CvImportProposal, sectionId: string, entryId: string): CvImportProposal {
  return { ...proposal, sections: renumber(proposal.sections.map((section) => {
    if (section.id !== sectionId) return section
    const index = section.entries.findIndex((entry) => entry.id === entryId)
    if (index < 1) return section
    const previous = section.entries[index - 1]
    const folded = section.entries[index]
    const lead = folded.heading?.trim() ? [[folded.heading.trim(), folded.subheading?.trim()].filter(Boolean).join(', ')] : []
    const bullets = [...linesOf(previous), ...lead, ...linesOf(folded)]
    const merged: ImportEntry = { ...previous, bullets, body: bullets.join('\n') }
    return { ...section, entries: [...section.entries.slice(0, index - 1), merged, ...section.entries.slice(index + 1)] }
  })) }
}

/** Move an entry to the end of another section. */
export function moveImportEntry(proposal: CvImportProposal, fromId: string, entryId: string, toId: string): CvImportProposal {
  if (fromId === toId) return proposal
  const entry = proposal.sections.find((section) => section.id === fromId)?.entries.find((candidate) => candidate.id === entryId)
  if (!entry || !proposal.sections.some((section) => section.id === toId)) return proposal
  return { ...proposal, sections: renumber(proposal.sections.map((section) => {
    if (section.id === fromId) return { ...section, entries: section.entries.filter((candidate) => candidate.id !== entryId) }
    if (section.id === toId) return { ...section, entries: [...section.entries, entry] }
    return section
  })) }
}

const clean = (value: string | null | undefined) => {
  const trimmed = value?.trim()
  return trimmed ? trimmed : null
}

const OPTIONAL_TEXT = ['heading', 'subheading', 'location', 'start_date', 'end_date'] as const

/** What the server accepts: blank optional fields become null, an entry's body follows its highlights, empty entries are dropped. Fields nobody touched stay as they came. */
export function toAcceptable(proposal: CvImportProposal, name: string): CvImportProposal {
  const header = proposal.header
  return {
    ...proposal,
    name: name.trim(),
    ...(header ? {
      header: {
        ...header,
        name: clean(header.name), headline: clean(header.headline), email: clean(header.email),
        phone: clean(header.phone), location: clean(header.location),
        links: (header.links ?? []).map((link) => link.trim()).filter(Boolean),
      },
    } : {}),
    sections: renumber(proposal.sections.map((section) => ({
      ...section,
      entries: section.entries.flatMap((entry) => {
        const next: ImportEntry = { ...entry }
        for (const key of OPTIONAL_TEXT) if (entry[key] !== undefined) next[key] = clean(entry[key])
        if (entry.bullets !== undefined) {
          next.bullets = entry.bullets.map((bullet) => bullet.trim()).filter(Boolean)
          if (next.bullets.length) next.body = next.bullets.join('\n')
        }
        next.body = next.body.trim()
        if (!next.body) {
          if (!next.heading) return []
          next.body = next.heading
        }
        return [next]
      }),
    }))),
  }
}

export const countEntries = (proposal: CvImportProposal) => proposal.sections.reduce((total, section) => total + section.entries.length, 0)

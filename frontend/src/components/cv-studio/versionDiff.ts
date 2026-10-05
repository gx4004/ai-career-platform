import type { CvEntry, CvSection } from '#/lib/api/schemas'

/** What an entry says, whatever field it is kept in: two entries with the same text are the same wording. */
const entryText = (entry: CvEntry) => JSON.stringify([
  entry.heading ?? '', entry.subheading ?? '', entry.location ?? '', entry.start_date ?? '', entry.end_date ?? '',
  entry.bullets?.length ? entry.bullets.map((bullet) => bullet.trim()) : entry.body.trim(),
])

export type VersionDiff = { changed: number; added: number; removed: number }

/** How a saved version differs from the CV being edited, counted in entries (matched by id). */
export function diffVersion(version: CvSection[], current: CvSection[]): VersionDiff {
  const currentEntries = new Map(current.flatMap((section) => section.entries.map((entry) => [entry.id, entryText(entry)] as const)))
  const versionEntries = new Map(version.flatMap((section) => section.entries.map((entry) => [entry.id, entryText(entry)] as const)))
  let changed = 0
  let added = 0
  for (const [id, text] of versionEntries) {
    const now = currentEntries.get(id)
    if (now === undefined) added += 1
    else if (now !== text) changed += 1
  }
  const removed = [...currentEntries.keys()].filter((id) => !versionEntries.has(id)).length
  return { changed, added, removed }
}

const plural = (count: number, one: string, other: string) => `${count} ${count === 1 ? one : other}`

/** "Reworded in 3 entries", "Same as your CV now": the line under a version's name. */
export function describeDiff(diff: VersionDiff) {
  if (diff.changed + diff.added + diff.removed === 0) return 'Same wording as your CV now'
  const parts = [
    diff.changed ? `${plural(diff.changed, 'entry', 'entries')} reworded` : '',
    diff.added ? `${plural(diff.added, 'entry', 'entries')} not in your CV now` : '',
    diff.removed ? `${plural(diff.removed, 'entry', 'entries')} only in your CV now` : '',
  ].filter(Boolean)
  return `Differs from your CV now: ${parts.join(', ')}`
}

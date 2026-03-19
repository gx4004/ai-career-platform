/**
 * In-memory file handoff cache for passing File objects between routes.
 * Dashboard stores a dropped file here, then navigates to /resume with the ID.
 * /resume retrieves and clears the entry on mount.
 */

let counter = 0
const cache = new Map<string, File>()

export function stashFile(file: File): string {
  const id = `handoff-${++counter}-${Date.now()}`
  cache.set(id, file)
  return id
}

export function retrieveFile(id: string): File | null {
  const file = cache.get(id) ?? null
  cache.delete(id)
  return file
}

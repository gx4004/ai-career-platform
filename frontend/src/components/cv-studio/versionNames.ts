import { ApiError } from '#/lib/api/errors'

/** Version names are unique per CV, compared exactly as the server does. */
export const isVersionNameTaken = (name: string, names: readonly string[]) => names.includes(name.trim())

/** "<base>", or "<base> 2", "<base> 3"… : the first one this CV does not have yet, within the 120-character limit. */
export function uniqueVersionName(base: string, names: readonly string[], maxLength = 120) {
  const taken = new Set(names)
  const first = base.slice(0, maxLength).trim()
  if (!taken.has(first)) return first
  for (let n = 2; ; n += 1) {
    const suffix = ` ${n}`
    const candidate = `${base.slice(0, maxLength - suffix.length).trim()}${suffix}`
    if (!taken.has(candidate)) return candidate
  }
}

export const versionNameTakenMessage = (name: string) => `You already have a version called “${name.trim()}”. Pick another name.`

/** The server's 409 on a version name ("Variant name already exists") in the words the studio uses. */
export const isVersionNameConflict = (error: unknown) => error instanceof ApiError && error.status === 409

import { removeSessionValuesByPrefix } from '#/lib/auth/storage'

export const editedLetterTexts = new Map<string, string>()
export const letterFlushers = new Map<string, () => Promise<void>>()

export function clearLetterState(): void {
  editedLetterTexts.clear()
  letterFlushers.clear()
  removeSessionValuesByPrefix('cw:letter-edit:')
}

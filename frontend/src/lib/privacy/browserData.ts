import { clearLetterState } from '#/lib/tools/letterState'
import { clearTransientResults } from '#/lib/tools/demoRuns'
import { clearAllToolDrafts, clearWorkflowContext } from '#/lib/tools/drafts'
import { removeSessionValuesByPrefix } from '#/lib/auth/storage'
import { clearResumeCarry } from '#/lib/tools/resumeCarryStore'

function clearBestEffort(clear: () => void): void {
  try {
    clear()
  } catch {
    // Sandboxed/private storage can reject access. Continue clearing the
    // independent stores and never let local cleanup strand logout state.
  }
}

export function clearSensitiveBrowserData(): void {
  clearBestEffort(clearAllToolDrafts)
  clearBestEffort(clearWorkflowContext)
  clearBestEffort(clearTransientResults)
  clearBestEffort(clearResumeCarry)
  clearBestEffort(clearLetterState)
  clearBestEffort(() => removeSessionValuesByPrefix('cw:practice:'))
  clearBestEffort(() => removeSessionValuesByPrefix('cw:practice-rounds:'))
}

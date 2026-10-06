import { useEffect } from 'react'
import { useToast } from '#/components/kit'

/** One-shot flag that survives the full-page redirect after an account is deleted. */
const ACCOUNT_DELETED_KEY = 'cw-account-deleted'

/** Call right before leaving for the landing page, after the browser's own data was cleared. */
export function markAccountDeleted() {
  try {
    sessionStorage.setItem(ACCOUNT_DELETED_KEY, '1')
  } catch {
    // Storage can be blocked; the deletion itself already succeeded.
  }
}

function takeAccountDeleted() {
  try {
    if (sessionStorage.getItem(ACCOUNT_DELETED_KEY) !== '1') return false
    sessionStorage.removeItem(ACCOUNT_DELETED_KEY)
    return true
  } catch {
    return false
  }
}

/** Says once, on the page the deletion lands on, that the account and its data are gone. Renders nothing. */
export function AccountDeletedToast() {
  const { toast } = useToast()
  useEffect(() => {
    if (!takeAccountDeleted()) return
    toast({
      id: 'account-deleted',
      tone: 'success',
      title: 'Your account was deleted',
      description: 'Everything in it was erased: runs, CVs, profile facts and applications.',
      duration: 10_000,
    })
  }, [toast])
  return null
}

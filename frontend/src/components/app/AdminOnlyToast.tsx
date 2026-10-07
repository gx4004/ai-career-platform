import { useEffect, useRef } from 'react'
import { useToast } from '#/components/kit'
import { ADMIN_ONLY_NOTICE } from '#/lib/auth/adminGuard'

/**
 * Says, once, why a signed-in non-admin who opened an /admin URL landed on the dashboard (otherwise it looks like a
 * broken link), then lets the route drop the flag so a reload or Back does not say it again. Renders nothing.
 */
export function AdminOnlyToast({ notice, onDone }: { notice: string | undefined; onDone: () => void }) {
  const { toast } = useToast()
  const done = useRef(onDone)
  done.current = onDone
  useEffect(() => {
    if (notice !== ADMIN_ONLY_NOTICE) return
    toast({
      id: 'admin-only',
      tone: 'neutral',
      title: 'That page is for admins',
      description: 'Your account does not have admin access',
    })
    done.current()
  }, [notice, toast])
  return null
}

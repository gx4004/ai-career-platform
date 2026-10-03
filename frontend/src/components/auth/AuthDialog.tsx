import { useEffect, useState } from 'react'
import { authCopy } from '#/components/auth/auth-copy'
import { AuthSurface } from '#/components/auth/AuthSurface'
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '#/components/kit'
import { useSession } from '#/hooks/useSession'

export function AuthDialog() {
  const {
    authDialogOpen,
    authView,
    closeAuthDialog,
  } = useSession()
  const [view, setView] = useState<'login' | 'register'>(authView)
  const [resetting, setResetting] = useState(false)
  const copy = authCopy(view, resetting)

  useEffect(() => {
    if (authDialogOpen) {
      setView(authView)
      setResetting(false)
    }
  }, [authDialogOpen, authView])

  return (
    <Dialog open={authDialogOpen} onOpenChange={(open) => !open && closeAuthDialog()}>
      <DialogContent
        size="sm"
        onOpenAutoFocus={(event) => {
          // The form is what the person came for: focus its first field, not the tab strip.
          const field = (event.target as HTMLElement).querySelector<HTMLInputElement>('input:not([type="hidden"])')
          if (field) {
            event.preventDefault()
            field.focus({ preventScroll: true })
          }
        }}
      >
        <DialogHeader>
          <DialogTitle>{copy.title}</DialogTitle>
          <DialogDescription>{copy.intro}</DialogDescription>
        </DialogHeader>
        <DialogBody>
          <AuthSurface
            view={view}
            onViewChange={setView}
            resetting={resetting}
            onResettingChange={setResetting}
            onSuccess={closeAuthDialog}
          />
        </DialogBody>
      </DialogContent>
    </Dialog>
  )
}

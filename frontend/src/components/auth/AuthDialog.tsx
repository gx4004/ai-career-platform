import { useEffect, useState } from 'react'
import { authCopy } from '#/components/auth/auth-copy'
import { AuthIntentNotice } from '#/components/auth/AuthIntentNotice'
import { AuthSurface } from '#/components/auth/AuthSurface'
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  focusFieldOnOpen,
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
        // The form is what the person came for: focus its first field, not the tab strip. On a touch screen the dialog
        // takes focus instead, so the keyboard does not cover "Your session ended" before it is read (consistency-F24).
        onOpenAutoFocus={(event) =>
          focusFieldOnOpen(event, (event.target as HTMLElement).querySelector<HTMLInputElement>('input:not([type="hidden"])'))
        }
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
            // The session-expired dialog opens over the page it interrupted: the note says the session ended and that
            // sign-in returns here (the pending intent is written just before the dialog opens).
            notice={resetting ? null : <AuthIntentNotice view={view} />}
          />
        </DialogBody>
      </DialogContent>
    </Dialog>
  )
}

import { useEffect, useState } from 'react'
import { AuthSurface } from '#/components/auth/AuthSurface'
import { useIsMobile } from '#/hooks/use-mobile'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '#/components/ui/dialog'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '#/components/ui/sheet'
import { useSession } from '#/hooks/useSession'

export function AuthDialog() {
  const {
    authDialogOpen,
    authView,
    closeAuthDialog,
  } = useSession()
  const [view, setView] = useState<'login' | 'register'>(authView)
  const isMobile = useIsMobile()

  useEffect(() => {
    if (authDialogOpen) {
      setView(authView)
    }
  }, [authDialogOpen, authView])

  if (!isMobile) {
    return (
      <Dialog open={authDialogOpen} onOpenChange={(open) => !open && closeAuthDialog()}>
        <DialogContent className="auth-dialog-content" showCloseButton>
          <DialogHeader className="sr-only">
            <DialogTitle>Keep your progress in one place.</DialogTitle>
            <DialogDescription>
              Sign in or create a free account to save runs, favorites, and next steps.
            </DialogDescription>
          </DialogHeader>
          <AuthSurface
            view={view}
            onViewChange={setView}
            onSuccess={closeAuthDialog}
          />
        </DialogContent>
      </Dialog>
    )
  }

  return (
    <Sheet open={authDialogOpen} onOpenChange={(open) => !open && closeAuthDialog()}>
      <SheetContent side="bottom" className="auth-dialog-sheet w-full max-w-none px-0 pb-0">
        <SheetHeader className="sr-only">
          <SheetTitle>Keep your progress in one place.</SheetTitle>
          <SheetDescription>
            Sign in or create a free account to save runs, favorites, and next steps.
          </SheetDescription>
        </SheetHeader>
        <AuthSurface
          view={view}
          onViewChange={setView}
          onSuccess={closeAuthDialog}
          className="auth-surface--sheet"
        />
      </SheetContent>
    </Sheet>
  )
}

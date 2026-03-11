import { useEffect, useState } from 'react'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '#/components/ui/tabs'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '#/components/ui/sheet'
import { LoginForm } from '#/components/auth/LoginForm'
import { RegisterForm } from '#/components/auth/RegisterForm'
import { Badge } from '#/components/ui/badge'
import { Button } from '#/components/ui/button'
import { useSession } from '#/hooks/useSession'

export function AuthDialog() {
  const {
    authDialogOpen,
    authView,
    closeAuthDialog,
    providers,
  } = useSession()
  const [view, setView] = useState<'login' | 'register'>(authView)

  useEffect(() => {
    if (authDialogOpen) {
      setView(authView)
    }
  }, [authDialogOpen, authView])

  return (
    <Sheet open={authDialogOpen} onOpenChange={(open) => !open && closeAuthDialog()}>
      <SheetContent side="right" className="w-full max-w-xl">
        <SheetHeader>
          <SheetTitle>Your AI career suite.</SheetTitle>
          <SheetDescription>
            Sign in to save runs, favorite results, and sync work across devices.
          </SheetDescription>
        </SheetHeader>
        <div className="mt-6 grid gap-6">
          <Tabs value={view} onValueChange={(value) => setView(value as typeof view)}>
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="login">Sign In</TabsTrigger>
              <TabsTrigger value="register">Create Account</TabsTrigger>
            </TabsList>
            <TabsContent value="login" className="mt-4">
              <LoginForm onSuccess={closeAuthDialog} />
            </TabsContent>
            <TabsContent value="register" className="mt-4">
              <RegisterForm onSuccess={closeAuthDialog} />
            </TabsContent>
          </Tabs>
          {providers.length > 0 ? (
            <div className="grid gap-2">
              <div className="flex items-center gap-2">
                <span className="small-copy muted-copy">Social sign-in</span>
                <Badge variant="outline">Coming soon</Badge>
              </div>
              <div className="grid gap-2">
                {providers
                  .filter((provider) => provider.enabled)
                  .map((provider) => (
                    <Button key={provider.provider} variant="outline" disabled>
                      Continue with {provider.label}
                    </Button>
                  ))}
              </div>
            </div>
          ) : null}
        </div>
      </SheetContent>
    </Sheet>
  )
}

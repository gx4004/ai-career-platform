import type { ReactNode } from 'react'
import { LoginForm } from '#/components/auth/LoginForm'
import type { AuthView } from '#/components/auth/auth-copy'
import { RegisterForm } from '#/components/auth/RegisterForm'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '#/components/kit'

/**
 * Sign in and create account behind one switch. Shared by the /login page and the session-expired dialog.
 * The caller owns `resetting` (it heads the surface with authCopy) and `notice` sits inside the panel, above the form.
 */
export function AuthSurface({
  view,
  onViewChange,
  resetting,
  onResettingChange,
  notice,
  onSuccess,
  onRegistering,
}: {
  view: AuthView
  onViewChange: (view: AuthView) => void
  resetting: boolean
  onResettingChange: (resetting: boolean) => void
  notice?: ReactNode
  onSuccess?: () => void
  onRegistering?: (registering: boolean) => void
}) {
  return (
    <Tabs value={view} onValueChange={(value) => onViewChange(value as AuthView)} data-auth-surface>
      {resetting ? null : (
        <TabsList aria-label="Sign in or create an account">
          <TabsTrigger value="login">Sign in</TabsTrigger>
          <TabsTrigger value="register">Create account</TabsTrigger>
        </TabsList>
      )}
      <TabsContent value="login">
        {notice}
        <LoginForm onSuccess={onSuccess} onResetChange={onResettingChange} />
      </TabsContent>
      <TabsContent value="register">
        {notice}
        <RegisterForm onSuccess={onSuccess} onRegistering={onRegistering} />
      </TabsContent>
    </Tabs>
  )
}

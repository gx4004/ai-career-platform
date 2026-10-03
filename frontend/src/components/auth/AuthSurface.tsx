import type { ReactNode } from 'react'
import { LoginForm } from '#/components/auth/LoginForm'
import type { AuthView } from '#/components/auth/auth-copy'
import { RegisterForm } from '#/components/auth/RegisterForm'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '#/components/kit'

/**
 * Sign in and create account behind one switch. Shared by the /login page and the session-expired dialog.
 * The caller owns `resetting` (it heads the surface with authCopy) and `notice` sits between the tabs and the form.
 */
export function AuthSurface({
  view,
  onViewChange,
  resetting,
  onResettingChange,
  notice,
  onSuccess,
}: {
  view: AuthView
  onViewChange: (view: AuthView) => void
  resetting: boolean
  onResettingChange: (resetting: boolean) => void
  notice?: ReactNode
  onSuccess?: () => void
}) {
  return (
    <Tabs value={view} onValueChange={(value) => onViewChange(value as AuthView)} data-auth-surface>
      {resetting ? null : (
        <TabsList aria-label="Sign in or create an account">
          <TabsTrigger value="login">Sign in</TabsTrigger>
          <TabsTrigger value="register">Create account</TabsTrigger>
        </TabsList>
      )}
      {notice}
      <TabsContent value="login">
        <LoginForm onSuccess={onSuccess} onResetChange={onResettingChange} />
      </TabsContent>
      <TabsContent value="register">
        <RegisterForm onSuccess={onSuccess} />
      </TabsContent>
    </Tabs>
  )
}

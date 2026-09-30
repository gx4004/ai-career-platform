import { AppBrandLockup } from '#/components/app/AppBrandLockup'
import { LoginForm } from '#/components/auth/LoginForm'
import { RegisterForm } from '#/components/auth/RegisterForm'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '#/components/ui/tabs'
import { cn } from '#/lib/utils'

type AuthView = 'login' | 'register'

export function AuthSurface({
  view,
  onViewChange,
  onSuccess,
  className,
}: {
  view: AuthView
  onViewChange: (view: AuthView) => void
  onSuccess?: () => void
  className?: string
}) {
  return (
    <div className={cn('auth-surface', className)} data-auth-surface>
      <div className="auth-surface-header">
        <AppBrandLockup className="auth-brand-lockup" />
        <div className="auth-surface-copy">
          <h1 className="auth-surface-title">
            {view === 'register' ? 'Create your workspace account' : 'Sign in to your workspace'}
          </h1>
          <p className="auth-intro-copy">
            Save your runs, favorites and progress across every tool.
          </p>
        </div>
      </div>

      <Tabs
        value={view}
        onValueChange={(value) => onViewChange(value as AuthView)}
        className="auth-surface-tabs"
      >
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="login">Sign in</TabsTrigger>
          <TabsTrigger value="register">Create account</TabsTrigger>
        </TabsList>
        <TabsContent value="login" className="mt-4">
          <LoginForm onSuccess={onSuccess} />
        </TabsContent>
        <TabsContent value="register" className="mt-4">
          <RegisterForm onSuccess={onSuccess} />
        </TabsContent>
      </Tabs>
    </div>
  )
}

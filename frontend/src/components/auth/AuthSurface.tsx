import { BookmarkCheck, History, Sparkles } from 'lucide-react'
import { AppBrandLockup } from '#/components/app/AppBrandLockup'
import { LoginForm } from '#/components/auth/LoginForm'
import { RegisterForm } from '#/components/auth/RegisterForm'
import { Badge } from '#/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '#/components/ui/tabs'
import { cn } from '#/lib/utils'

type AuthView = 'login' | 'register'

const AUTH_BENEFITS = [
  {
    icon: BookmarkCheck,
    title: 'Save every run',
    description: 'Keep results, notes, and favorites in one workspace.',
  },
  {
    icon: History,
    title: 'Pick up anywhere',
    description: 'Return to recent work without rebuilding your context.',
  },
  {
    icon: Sparkles,
    title: 'Stay in flow',
    description: 'Carry resume, match, and application work across tools.',
  },
] as const

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
        <Badge variant="outline" className="auth-surface-badge w-fit">
          Free workspace
        </Badge>
        <AppBrandLockup className="auth-brand-lockup" />
        <div className="auth-surface-copy">
          <h1 className="auth-surface-title">Keep your progress in one place.</h1>
          <p className="auth-intro-copy">
            Sign in or join free to save runs, favorites, and next steps across every tool.
          </p>
        </div>
      </div>

      <div className="auth-surface-benefits" aria-label="Sign-in benefits">
        {AUTH_BENEFITS.map((item) => (
          <div key={item.title} className="auth-surface-benefit">
            <div className="auth-surface-benefit-icon">
              <item.icon size={15} />
            </div>
            <div className="auth-surface-benefit-copy">
              <p className="auth-surface-benefit-title">{item.title}</p>
              <p className="small-copy muted-copy">{item.description}</p>
            </div>
          </div>
        ))}
      </div>

      <Tabs
        value={view}
        onValueChange={(value) => onViewChange(value as AuthView)}
        className="auth-surface-tabs"
      >
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="login">Sign In</TabsTrigger>
          <TabsTrigger value="register">Create Account</TabsTrigger>
        </TabsList>
        <TabsContent value="login" className="mt-4">
          <LoginForm onSuccess={onSuccess} />
        </TabsContent>
        <TabsContent value="register" className="mt-4">
          <RegisterForm onSuccess={onSuccess} />
        </TabsContent>
      </Tabs>

      <p className="small-copy muted-copy auth-surface-note">
        Email sign-in unlocks saved workspace history. Browsing first? You can still use the dashboard as a guest.
      </p>
    </div>
  )
}

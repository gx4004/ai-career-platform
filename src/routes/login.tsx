import { createFileRoute, Link } from '@tanstack/react-router'
import { AppBrandLockup } from '#/components/app/AppBrandLockup'
import { Badge } from '#/components/ui/badge'
import { Button } from '#/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '#/components/ui/tabs'
import { AppStatePanel } from '#/components/app/AppStatePanel'
import { LoginForm } from '#/components/auth/LoginForm'
import { ProofCard } from '#/components/illustrations/ProofCard'
import { SceneEvidence } from '#/components/illustrations/SceneEvidence'
import { RegisterForm } from '#/components/auth/RegisterForm'
import { useSession } from '#/hooks/useSession'
import { toolList, tools } from '#/lib/tools/registry'

export const Route = createFileRoute('/login')({
  component: LoginPage,
})

export function LoginPage() {
  const { status, providers } = useSession()

  if (status === 'authenticated') {
    return (
      <AppStatePanel
        badge="Authenticated"
        title="You are already signed in"
        description="Use the dashboard to continue the workflow."
        scene="emptyPlanning"
        actions={[{ label: 'Go to dashboard', to: '/dashboard' }]}
      />
    )
  }

  return (
    <div className="auth-page">
      <div className="auth-panel">
        <div className="auth-form-shell">
          <div className="grid gap-6">
            <div className="grid gap-3">
              <Link to="/dashboard" className="small-copy muted-copy">
                Back to dashboard
              </Link>
              <AppBrandLockup className="auth-brand-lockup" />
              <div className="grid gap-2">
                <h1 className="page-title">Your AI career suite.</h1>
                <p className="muted-copy">
                  Sign in to save progress and sync across devices.
                </p>
              </div>
            </div>
            <Tabs defaultValue="login">
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="login">Sign In</TabsTrigger>
                <TabsTrigger value="register">Create Account</TabsTrigger>
              </TabsList>
              <TabsContent value="login" className="mt-4">
                <LoginForm />
              </TabsContent>
              <TabsContent value="register" className="mt-4">
                <RegisterForm />
              </TabsContent>
            </Tabs>
            {providers.length > 0 ? (
              <div className="grid gap-2">
                <div className="flex items-center gap-2">
                  <p className="small-copy muted-copy">Social sign-in</p>
                  <Badge variant="outline">Coming soon</Badge>
                </div>
                {providers
                  .filter((provider) => provider.enabled)
                  .map((provider) => (
                    <Button key={provider.provider} variant="outline" disabled>
                      Continue with {provider.label}
                    </Button>
                  ))}
              </div>
            ) : null}
          </div>
        </div>
      </div>
      <div className="auth-visual">
        <div className="auth-visual-shell h-full p-8">
          <div className="grid h-full gap-8">
            <div className="grid gap-3">
              <Badge variant="outline" className="w-fit">
                Six AI tools. One workflow.
              </Badge>
              <h2 className="display-lg text-gradient-brand">
                Everything for a focused job search — in one place.
              </h2>
              <p className="muted-copy">
                Resume review, role matching, application support, and longer-term planning all stay connected.
              </p>
            </div>
            <SceneEvidence scene="loginWorkflow" className="auth-evidence-stage">
              <ProofCard
                compact
                className="auth-proof-card"
                icon={tools.portfolio.icon}
                accent={tools.portfolio.accent}
                eyebrow="Saved workspace"
                title="Runs, favorites, and next steps stay available after sign-in"
                rows={[
                  { label: 'Saved runs', value: '12' },
                  { label: 'Favorites', value: '4' },
                ]}
              />
            </SceneEvidence>
            <div className="auth-tool-mini-grid">
              {toolList.map((tool) => (
                <div key={tool.id} className="auth-tool-mini">
                  <div className="flex items-center gap-3">
                    <tool.icon size={16} style={{ color: tool.accent }} />
                    <div>
                      <p>{tool.shortLabel}</p>
                      <p className="small-copy muted-copy">{tool.summary}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
            <p className="small-copy muted-copy">6 tools · Free · 1 workflow</p>
          </div>
        </div>
      </div>
    </div>
  )
}

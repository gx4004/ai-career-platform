import { LockKeyhole } from 'lucide-react'
import { Button } from '#/components/ui/button'
import { useSession } from '#/hooks/useSession'

export function GuestPrompt() {
  const { openAuthDialog } = useSession()

  return (
    <div className="dash-card p-6" style={{ borderLeft: '3px solid var(--accent)' }}>
      <div className="flex items-start gap-4">
        <div className="rounded-full p-3" style={{ background: 'var(--accent-soft)' }}>
          <LockKeyhole size={18} style={{ color: 'var(--accent)' }} />
        </div>
        <div className="grid gap-3">
          <div className="grid gap-1">
            <h3 className="section-title">Sign in to save your workflow</h3>
            <p className="muted-copy">
              Guests can run the tools, but saved history and favorites are part of the authenticated workspace.
            </p>
          </div>
          <div className="button-cluster">
            <Button
              className="button-hero-primary"
              onClick={() => openAuthDialog({ to: '/history', reason: 'history' })}
            >
              Sign in
            </Button>
            <Button variant="outline" asChild className="button-surface-secondary">
              <a href="/resume">Start with Resume</a>
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}

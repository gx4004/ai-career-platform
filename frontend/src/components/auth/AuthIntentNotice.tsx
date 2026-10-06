import { useEffect, useState } from 'react'
import { Notice } from '#/components/kit'
import { readPendingIntent, type PendingIntent } from '#/lib/auth/pendingIntent'
import { tools } from '#/lib/tools/registry'

/** What the visitor was doing when sign-in came up, in the words of the place they will land. */
export function intentCopy(intent: PendingIntent, view: 'login' | 'register'): { title: string; text: string } | null {
  const tool = intent.toolId ? tools[intent.toolId]?.label : undefined
  const back = tool ? `You'll go straight back to ${tool}` : "You'll go straight back to where you were"
  switch (intent.reason) {
    case 'session-expired':
      return { title: 'Your session ended', text: "Sign in again and we'll take you back to where you were." }
    case 'guest-demo-result':
    case 'save-demo-result':
      return {
        title: view === 'register' ? 'Your resume is ready' : 'Sign in to save this result',
        text: `${back}${view === 'register' ? ' with your resume carried over, ready to run again and save.' : ', with your resume ready to run again.'}`,
      }
    case 'export-pdf':
      return { title: 'Sign in to export', text: `${back}.` }
    case 'open-result':
      return { title: 'Sign in to open this result', text: "It's saved to your account. You'll go straight back to it." }
    default:
      return intent.to && intent.to !== '/' ? { title: 'Sign in to continue', text: `${back}.` } : null
  }
}

/** A short lemon note above the form when sign-in interrupted something, so the visitor knows where they will land. */
export function AuthIntentNotice({ view }: { view: 'login' | 'register' }) {
  const [intent, setIntent] = useState<PendingIntent | null>(null)
  useEffect(() => {
    setIntent(readPendingIntent())
  }, [])
  const copy = intent ? intentCopy(intent, view) : null
  if (!copy) return null
  return (
    <Notice title={copy.title} role="status" data-testid="auth-intent">
      {copy.text}
    </Notice>
  )
}

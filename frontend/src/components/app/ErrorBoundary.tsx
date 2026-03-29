import { Component } from 'react'
import type { ErrorInfo, ReactNode } from 'react'
import { AlertTriangle } from 'lucide-react'
import { AppStatePanel } from '#/components/app/AppStatePanel'
import { captureAppError } from '#/lib/telemetry/client'

const CRASH_COUNT_KEY = 'cw:consecutive-crashes'

type Props = { children: ReactNode }
type State = { error: Error | null }

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[ErrorBoundary]', error, info.componentStack)
    captureAppError(error, {
      source: 'error-boundary',
      componentStack: info.componentStack,
    })

    // Track consecutive crashes — auto-redirect on 2nd
    const count = Number(sessionStorage.getItem(CRASH_COUNT_KEY) || '0') + 1
    sessionStorage.setItem(CRASH_COUNT_KEY, String(count))

    if (count >= 2) {
      sessionStorage.removeItem(CRASH_COUNT_KEY)
      window.location.href = '/dashboard'
    }
  }

  private reset = () => {
    // Don't reset crash counter on Try Again — only on successful render
    this.setState({ error: null })
  }

  componentDidUpdate(_: Props, prevState: State) {
    // Reset crash counter when we successfully render after an error
    if (prevState.error && !this.state.error) {
      sessionStorage.removeItem(CRASH_COUNT_KEY)
    }
  }

  render() {
    if (this.state.error) {
      return (
        <AppStatePanel
          badge="Something went wrong"
          scene="emptyPlanning"
          icon={<AlertTriangle size={48} style={{ color: 'var(--warning)' }} />}
          title="An unexpected error occurred"
          description="The page crashed while rendering. This has been logged."
          detail={this.state.error.message}
          actions={[
            { label: 'Try again', onClick: this.reset },
            { label: 'Go to dashboard', to: '/dashboard', variant: 'outline' },
          ]}
        />
      )
    }

    return this.props.children
  }
}

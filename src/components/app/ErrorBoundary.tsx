import { Component } from 'react'
import type { ErrorInfo, ReactNode } from 'react'
import { AlertTriangle } from 'lucide-react'
import { AppStatePanel } from '#/components/app/AppStatePanel'

type Props = { children: ReactNode }
type State = { error: Error | null }

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[ErrorBoundary]', error, info.componentStack)
  }

  private reset = () => this.setState({ error: null })

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

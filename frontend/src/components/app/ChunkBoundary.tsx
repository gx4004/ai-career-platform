import { Component } from 'react'
import type { ReactNode } from 'react'

type Props = { children: ReactNode; onError: (error: Error) => void }
type State = { failed: boolean }

/**
 * Wraps a dialog whose code is a separately loaded chunk. The chunk can fail to load (the tab is offline,
 * or a deploy replaced the hashed files while this tab stayed open); without this the rejected lazy import
 * would reach the root error screen and take the page down with it. Renders nothing and lets the owner
 * decide how to recover.
 */
export class ChunkBoundary extends Component<Props, State> {
  state: State = { failed: false }

  static getDerivedStateFromError(): State {
    return { failed: true }
  }

  componentDidCatch(error: Error) {
    this.props.onError(error)
  }

  render() {
    return this.state.failed ? null : this.props.children
  }
}

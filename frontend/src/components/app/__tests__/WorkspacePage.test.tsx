import { render, screen } from '@testing-library/react'
import { FileText } from 'lucide-react'
import { describe, expect, it } from 'vitest'
import {
  StatusPill,
  WorkspaceEmpty,
  WorkspaceHero,
  WorkspacePage,
  WorkspacePanel,
} from '#/components/app/WorkspacePage'

describe('workspace primitives', () => {
  it('renders the hero as the page heading with stats and actions', () => {
    render(
      <WorkspacePage>
        <WorkspaceHero
          icon={FileText}
          eyebrow="CV Studio"
          title="Your CV"
          subtitle="Edit and export."
          actions={<button type="button">Export</button>}
          stats={[{ label: 'ATS score', value: 82 }]}
        />
      </WorkspacePage>,
    )

    expect(screen.getByRole('main').classList.contains('workspace-page')).toBe(true)
    expect(screen.getByRole('heading', { level: 1, name: 'Your CV' })).toBeTruthy()
    expect(screen.getByText('CV Studio')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Export' })).toBeTruthy()
    expect(screen.getByText('ATS score')).toBeTruthy()
    expect(screen.getByText('82')).toBeTruthy()
  })

  it('renders a panel with a section heading and body', () => {
    render(
      <WorkspacePanel kicker="Style" title="Design" description="Fonts and colours">
        <p>body</p>
      </WorkspacePanel>,
    )

    expect(screen.getByRole('heading', { level: 2, name: 'Design' })).toBeTruthy()
    expect(screen.getByText('body')).toBeTruthy()
  })

  it('renders an empty state and a toned status pill', () => {
    render(
      <>
        <WorkspaceEmpty title="Nothing yet" description="Add your first item." />
        <StatusPill tone="positive">Saved</StatusPill>
      </>,
    )

    expect(screen.getByText('Nothing yet')).toBeTruthy()
    expect(screen.getByText('Saved').classList.contains('status-pill--positive')).toBe(true)
  })
})

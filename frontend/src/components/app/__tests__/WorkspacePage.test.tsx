import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { WorkspaceEmpty, WorkspacePage } from '#/components/app/WorkspacePage'

describe('workspace primitives', () => {
  it('frames a page as the one main landmark', () => {
    render(
      <WorkspacePage wide>
        <h1>Your CV</h1>
      </WorkspacePage>,
    )

    const main = screen.getByRole('main')
    expect(main.id).toBe('main-content')
    expect(main.classList.contains('workspace-page--wide')).toBe(true)
    expect(screen.getByRole('heading', { level: 1, name: 'Your CV' })).toBeTruthy()
  })

  it('renders an empty state with its description and action', () => {
    render(
      <WorkspaceEmpty
        title="Nothing yet"
        description="Add your first item."
        action={<button type="button">Add</button>}
      />,
    )

    expect(screen.getByText('Nothing yet')).toBeTruthy()
    expect(screen.getByText('Add your first item.')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Add' })).toBeTruthy()
  })
})

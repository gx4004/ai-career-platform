import { render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ToolForm } from '#/components/tooling/toolPageShared'

describe('ToolForm: a failed run', () => {
  const scrollIntoView = vi.fn()

  beforeEach(() => {
    scrollIntoView.mockReset()
    Element.prototype.scrollIntoView = scrollIntoView
  })

  afterEach(() => {
    // jsdom has no scrollIntoView of its own.
    delete (Element.prototype as Partial<Element>).scrollIntoView
  })

  // The working panel scrolled to its own top; on a phone the error by the submit would sit below the fold or under the
  // tab tray, and focus would fall to <body>. The form brings the error into view and puts focus on the way to retry.
  it('brings the run error into view and focuses the submit button', () => {
    render(
      <ToolForm toolId="interview" label="Interview Q&A input form" onSubmit={vi.fn()} submitLabel="Build interview prep" error={new Error('The model provider is unavailable.')}>
        <p>fields</p>
      </ToolForm>,
    )
    const notice = screen.getByRole('alert')
    expect(notice.textContent).toContain('The model provider is unavailable.')
    expect(scrollIntoView).toHaveBeenCalledTimes(1)
    expect(scrollIntoView.mock.contexts[0]).toBe(notice)
    expect(scrollIntoView.mock.calls[0][0]).toMatchObject({ block: 'center' })
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Build interview prep' }))
  })

  it('does not move the page or the focus when there is no error', () => {
    render(
      <ToolForm toolId="interview" label="Interview Q&A input form" onSubmit={vi.fn()} submitLabel="Build interview prep">
        <p>fields</p>
      </ToolForm>,
    )
    expect(screen.queryByRole('alert')).toBeNull()
    expect(scrollIntoView).not.toHaveBeenCalled()
    expect(document.activeElement).toBe(document.body)
  })
})

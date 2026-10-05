import type { AnchorHTMLAttributes, ReactNode } from 'react'
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { AppStatePanel } from '#/components/app/AppStatePanel'

vi.mock('@tanstack/react-router', () => ({
  Link: ({ children, to, ...props }: { children: ReactNode; to: string } & AnchorHTMLAttributes<HTMLAnchorElement>) => (
    <a href={to} {...props}>
      {children}
    </a>
  ),
}))

describe('AppStatePanel', () => {
  it('puts a rose "!" seal beside the error copy by default, with the detail in its own block', () => {
    const { container } = render(
      <AppStatePanel badge="Route error" title="This route failed to load" description="Something broke." detail="boom" />,
    )
    const seal = container.querySelector('.state-page .kit-seal')!
    expect(seal.getAttribute('data-tone')).toBe('rose')
    expect(seal.textContent).toContain('!')
    expect(screen.getByRole('heading', { level: 1, name: 'This route failed to load' })).toBeTruthy()
    expect(screen.getByText('Route error')).toBeTruthy()
    expect(container.querySelector('.kit-error__detail')!.textContent).toBe('boom')
  })

  it('announces a failure as an alert and an update prompt as a quiet status', () => {
    const { rerender } = render(<AppStatePanel title="Broke" description="Sorry." />)
    expect(screen.getByRole('alert')).toBeTruthy()
    rerender(<AppStatePanel title="Updated" description="Reload." role="status" />)
    expect(screen.queryByRole('alert')).toBeNull()
    expect(screen.getByRole('status')).toBeTruthy()
  })

  it('takes another seal for another kind of state', () => {
    const { container } = render(
      <AppStatePanel title="Updated" description="Reload." seal={{ value: 'New', label: 'Update available', tone: 'lilac' }} />,
    )
    expect(container.querySelector('.state-page .kit-seal')!.getAttribute('data-tone')).toBe('lilac')
  })

  it('makes the first action primary and the rest secondary', () => {
    const retry = vi.fn()
    render(
      <AppStatePanel
        title="Oops"
        description="Try again."
        actions={[
          { label: 'Try again', onClick: retry },
          { label: 'Go to dashboard', to: '/dashboard', variant: 'outline' },
        ]}
      />,
    )
    const primary = screen.getByRole('button', { name: 'Try again' })
    expect(primary.className).toContain('kit-button--primary')
    expect(screen.getByRole('link', { name: 'Go to dashboard' }).className).toContain('kit-button--secondary')
    fireEvent.click(primary)
    expect(retry).toHaveBeenCalled()
  })
})

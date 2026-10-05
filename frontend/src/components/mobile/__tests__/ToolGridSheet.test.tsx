import type { AnchorHTMLAttributes, ReactNode } from 'react'
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { ToolGridSheet } from '#/components/mobile/ToolGridSheet'

vi.mock('@tanstack/react-router', () => ({
  Link: ({
    children,
    to,
    ...props
  }: {
    children: ReactNode
    to: string
  } & AnchorHTMLAttributes<HTMLAnchorElement>) => (
    <a
      href={to}
      {...props}
      onClick={(event) => {
        props.onClick?.(event)
        event.preventDefault()
      }}
    >
      {children}
    </a>
  ),
}))

describe('ToolGridSheet authenticated workspace navigation', () => {
  it('exposes every mobile-only workspace destination to an owner, grouped like the sidebar', () => {
    render(
      <ToolGridSheet
        open
        onOpenChange={vi.fn()}
        showAuthenticatedLinks
      />,
    )

    expect(screen.getByRole('link', { name: 'Profile' }).getAttribute('href')).toBe('/profile')
    expect(screen.getByRole('link', { name: 'CV Studio' }).getAttribute('href')).toBe('/cv-studio')
    expect(screen.getByRole('link', { name: 'Discover' }).getAttribute('href')).toBe('/discovery')
    expect(screen.getByRole('link', { name: 'Applications' }).getAttribute('href')).toBe('/campaigns')
    expect(screen.getByRole('heading', { name: 'Job search' })).toBeTruthy()
    expect(screen.getByRole('heading', { name: 'You' })).toBeTruthy()
  })

  it('keeps job-search destinations absent for guests, but keeps You visible', () => {
    render(<ToolGridSheet open onOpenChange={vi.fn()} showAuthenticatedLinks={false} />)

    expect(screen.queryByRole('link', { name: 'Discover' })).toBeNull()
    expect(screen.queryByRole('link', { name: 'Applications' })).toBeNull()
    expect(screen.getByRole('link', { name: 'Profile' }).getAttribute('href')).toBe('/profile')
    expect(screen.getByRole('link', { name: 'CV Studio' }).getAttribute('href')).toBe('/cv-studio')
  })

  it('lists the six tools first and closes when one is chosen', () => {
    const onOpenChange = vi.fn()
    render(<ToolGridSheet open onOpenChange={onOpenChange} showAuthenticatedLinks />)

    expect(screen.getByRole('dialog', { name: 'More' })).toBeTruthy()
    const tools = screen.getByRole('list', { name: 'Tools' })
    expect(tools.querySelectorAll('li')).toHaveLength(6)
    expect(screen.getByRole('heading', { name: 'Tools' })).toBeTruthy()

    fireEvent.click(screen.getByRole('link', { name: 'Career Path' }))
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })

  it('renders the tools as colour tiles in a list of links, one tone each', () => {
    render(<ToolGridSheet open onOpenChange={vi.fn()} showAuthenticatedLinks />)

    const tiles = screen.getByRole('list', { name: 'Tools' }).querySelectorAll('li.app-more__tile--tool')
    expect([...tiles].every((tile) => tile.querySelector('a[href]'))).toBe(true)
    expect([...tiles].map((tile) => tile.getAttribute('data-tone'))).toEqual([
      'tangerine',
      'mint',
      'lilac',
      'lemon',
      'rose',
      'aqua',
    ])
  })

  it('adds Search and the account to the You group when the caller provides them', () => {
    const onSearch = vi.fn()
    const onOpenChange = vi.fn()
    vi.useFakeTimers()
    render(
      <ToolGridSheet open onOpenChange={onOpenChange} showAuthenticatedLinks accountName="Ada Lovelace" onSearch={onSearch} />,
    )

    expect(screen.getByRole('link', { name: 'Ada Lovelace' }).getAttribute('href')).toBe('/account')
    fireEvent.click(screen.getByRole('button', { name: 'Search' }))
    expect(onOpenChange).toHaveBeenCalledWith(false)
    vi.runAllTimers()
    expect(onSearch).toHaveBeenCalledTimes(1)
    vi.useRealTimers()
  })

  it('offers neither without them (guests)', () => {
    render(<ToolGridSheet open onOpenChange={vi.fn()} />)

    expect(screen.queryByRole('button', { name: 'Search' })).toBeNull()
    expect(screen.queryByRole('link', { name: '/account' })).toBeNull()
  })
})

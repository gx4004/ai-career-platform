import type { AnchorHTMLAttributes, ReactNode } from 'react'
import { render, screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { LegalLayout } from '#/components/legal/LegalLayout'

vi.mock('@tanstack/react-router', () => ({
  Link: ({ children, to, ...props }: { children: ReactNode; to: string } & AnchorHTMLAttributes<HTMLAnchorElement>) => (
    <a href={to} {...props}>
      {children}
    </a>
  ),
}))

describe('LegalLayout', () => {
  it('is one reading page: the brand, a way back, a title with its date, the text and the other pages', () => {
    render(
      <LegalLayout title="Privacy Policy" lastUpdated="2026-04-28">
        <h2>1. Who we are</h2>
        <p>Text.</p>
      </LegalLayout>,
    )
    expect(screen.getByRole('main')).toBeTruthy()
    expect(screen.getByRole('heading', { level: 1, name: 'Privacy Policy' })).toBeTruthy()
    expect(screen.getByText('Last updated Apr 28, 2026')).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Career Workbench home' }).getAttribute('href')).toBe('/')
    expect(screen.getByRole('link', { name: 'Back to app' }).getAttribute('href')).toBe('/dashboard')
    expect(screen.getByRole('heading', { level: 2, name: '1. Who we are' })).toBeTruthy()
  })

  it('links the four legal pages once, at the foot of the page', () => {
    render(
      <LegalLayout title="Terms of Service">
        <p>Text.</p>
      </LegalLayout>,
    )
    const nav = within(screen.getByRole('navigation', { name: 'Legal pages' }))
    expect(nav.getAllByRole('link').map((link) => link.getAttribute('href'))).toEqual([
      '/privacy',
      '/terms',
      '/cookies',
      '/imprint',
    ])
    expect(screen.getAllByRole('navigation')).toHaveLength(1)
  })
})

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

  it('builds a contents rail from the h2 headings and gives each one an id', () => {
    render(
      <LegalLayout title="Privacy Policy">
        <h2>1. Who we are</h2>
        <p>Text.</p>
        <h2>2. What data we collect</h2>
        <p>Text.</p>
        <h2>3. Contact</h2>
        <p>Text.</p>
      </LegalLayout>,
    )
    const rail = within(screen.getByRole('navigation', { name: 'On this page' }))
    expect(rail.getAllByRole('link').map((link) => link.textContent)).toEqual(['1. Who we are', '2. What data we collect', '3. Contact'])
    expect(rail.getByRole('link', { name: '1. Who we are' }).getAttribute('href')).toBe('#legal-who-we-are')
    expect(screen.getByRole('heading', { level: 2, name: '1. Who we are' }).id).toBe('legal-who-we-are')
  })

  it('skips the rail on a page with only a couple of sections', () => {
    render(
      <LegalLayout title="Imprint">
        <h2>Contact</h2>
        <p>Text.</p>
      </LegalLayout>,
    )
    expect(screen.queryByRole('navigation', { name: 'On this page' })).toBeNull()
  })
})

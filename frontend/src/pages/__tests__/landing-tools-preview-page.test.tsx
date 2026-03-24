import type { AnchorHTMLAttributes, ReactNode } from 'react'
import { render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { LandingToolsPreviewPage } from '#/pages/landing-tools-preview-page'

const scrollToMock = vi.hoisted(() => vi.fn())

vi.mock('@tanstack/react-router', () => ({
  Link: ({
    children,
    to,
    ...props
  }: {
    children: ReactNode
    to: string
  } & AnchorHTMLAttributes<HTMLAnchorElement>) => (
    <a href={to} {...props}>
      {children}
    </a>
  ),
}))

vi.mock('#/components/app/AppBrandLockup', () => ({
  AppBrandLockup: () => <div data-testid="brand-lockup" />,
}))

vi.mock('#/components/landing/LandingToolGrid', () => ({
  LandingToolGrid: () => <div data-testid="landing-tool-grid" />,
}))

beforeEach(() => {
  scrollToMock.mockReset()
  Object.defineProperty(window, 'scrollTo', {
    value: scrollToMock,
    writable: true,
  })
})

afterEach(() => {
  document.body.className = ''
})

describe('LandingToolsPreviewPage', () => {
  it('renders the isolated six-tools preview as a public landing surface', () => {
    render(<LandingToolsPreviewPage />)

    expect(document.body.classList.contains('page-tone-landing')).toBe(true)
    expect(screen.getByLabelText('Back to landing').getAttribute('href')).toBe('/')
    expect(screen.getByTestId('brand-lockup')).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Start free' }).getAttribute('href')).toBe('/dashboard')
    expect(screen.getByTestId('landing-tool-grid')).toBeTruthy()
    expect(scrollToMock).toHaveBeenCalledWith({ top: 0, left: 0, behavior: 'auto' })
  })
})


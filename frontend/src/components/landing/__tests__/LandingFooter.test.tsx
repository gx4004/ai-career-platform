import fs from 'node:fs'
import path from 'node:path'
import type { ReactNode } from 'react'
import { render } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { LandingFooter } from '#/components/landing/LandingFooter'

vi.mock('@tanstack/react-router', () => ({
  Link: ({ children, to, ...props }: { children: ReactNode; to: string }) => (
    <a href={to} {...props}>{children}</a>
  ),
}))

const routesDir = path.resolve(__dirname, '../../../routes')

function routeFileExists(route: string) {
  if (route === '/') return fs.existsSync(path.join(routesDir, 'index.tsx'))
  const name = route.slice(1).replaceAll('/', '.')
  return fs.existsSync(path.join(routesDir, `${name}.tsx`)) || fs.existsSync(path.join(routesDir, `${name}.index.tsx`))
}

describe('LandingFooter', () => {
  it('only links to routes that exist and anchors that are on the page', () => {
    const { container } = render(<LandingFooter />)
    const links = [...container.querySelectorAll('a')].map((a) => a.getAttribute('href') ?? '')
    expect(links.length).toBeGreaterThan(0)
    for (const href of links) {
      expect(href).not.toBe('#')
      if (href.startsWith('/')) expect(routeFileExists(href), href).toBe(true)
    }
  })
})

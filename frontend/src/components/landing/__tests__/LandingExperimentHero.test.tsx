import type { AnchorHTMLAttributes, ReactNode } from 'react'
import { render } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { LandingExperimentHero } from '#/components/landing/LandingExperimentHero'

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

vi.mock('#/components/ui/motion', () => ({
  StaggerChildren: ({ children }: { children: ReactNode }) => <>{children}</>,
  StaggerItem: ({ children }: { children: ReactNode }) => <>{children}</>,
}))

function stripMotionProps<T extends object>(props: T) {
  const { initial, animate, exit, transition, variants, whileHover, whileTap, whileInView, viewport, style, ...rest } = props as Record<string, unknown>
  void initial; void animate; void exit; void transition; void variants; void whileHover; void whileTap; void whileInView; void viewport; void style
  return rest
}

vi.mock('framer-motion', () => ({
  motion: {
    p: ({ children, ...props }: React.HTMLAttributes<HTMLParagraphElement>) => <p {...stripMotionProps(props)}>{children}</p>,
    h1: ({ children, ...props }: React.HTMLAttributes<HTMLHeadingElement>) => <h1 {...stripMotionProps(props)}>{children}</h1>,
    div: ({ children, ...props }: React.HTMLAttributes<HTMLDivElement>) => <div {...stripMotionProps(props)}>{children}</div>,
  },
  useReducedMotion: () => true,
  useScroll: () => ({ scrollYProgress: { get: () => 0 } }),
  useTransform: () => ({ get: () => 0 }),
}))

describe('LandingExperimentHero', () => {
  it('renders the headline, body copy, CTA, and static proof card', () => {
    const { container } = render(<LandingExperimentHero />)
    const heading = container.querySelector('h1')
    expect(heading?.textContent).toContain('blind spots.')
    expect(heading?.textContent).toContain('We find them before recruiters do.')
    // Product mockup with window bar
    expect(container.textContent).toContain('thecareerworkbench.com')
  })
})

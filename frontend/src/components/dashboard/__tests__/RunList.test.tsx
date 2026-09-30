import type { ReactNode } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import { History } from 'lucide-react'
import { describe, expect, it, vi } from 'vitest'
import { RunList } from '#/components/dashboard/RunList'

vi.mock('@tanstack/react-router', () => ({
  Link: ({ children, to, ...props }: { children: ReactNode; to: string } & Record<string, unknown>) => (
    <a href={to} {...props}>{children}</a>
  ),
}))
vi.mock('#/components/ui/motion', () => ({
  ScrollFadeUp: ({ children }: { children: ReactNode }) => <>{children}</>,
}))
vi.mock('#/hooks/useSession', () => ({ useSession: () => ({ status: 'authenticated' }) }))
vi.mock('#/hooks/useHistory', () => ({
  useHistory: () => ({
    isPending: false,
    data: {
      items: [
        {
          id: 'r1',
          tool_name: 'application-drafts',
          label: 'Acme draft',
          created_at: new Date().toISOString(),
        },
      ],
    },
  }),
}))

describe('RunList', () => {
  it('labels application drafts "Application" and links to the board', () => {
    render(
      <QueryClientProvider client={new QueryClient()}>
        <RunList
          eyebrow="Recent"
          title="Recent"
          emptyIcon={History}
          emptyText="none"
          unauthText="sign in"
          queryParams={{}}
        />
      </QueryClientProvider>,
    )
    expect(screen.getByText('Application')).toBeTruthy()
    expect(screen.queryByText('application-drafts')).toBeNull()
    expect(screen.getByRole('link').getAttribute('href')).toBe('/campaigns')
  })
})

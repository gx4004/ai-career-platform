import type { ComponentProps, ReactNode } from 'react'
import { Button, EmptyState, Page, PageHeader } from '#/components/kit'
import { useSession } from '#/hooks/useSession'

type SignInGateProps = {
  /** The page's own title, so a guest sees where they are (the same header the signed-in page has). */
  pageTitle: string
  /** The 20px icon in the die-cut's lemon disc (the page's destination icon). */
  icon: ReactNode
  title: string
  description: string
  /** Where sign-in returns to. */
  to: string
  reason?: string
  width?: ComponentProps<typeof Page>['width']
}

/**
 * What a guest sees on a page that only works signed in: the page's header and a die-cut empty state with one action,
 * Sign in (STICKER 4.O: at most one action), which opens the sign-in dialog and comes back here. Every signed-in-only
 * page uses this one gate in place (consistency-F25); none bounces a guest to /login.
 */
export function SignInGate({ pageTitle, icon, title, description, to, reason = 'protected-route', width }: SignInGateProps) {
  const { openAuthDialog } = useSession()
  return (
    <Page width={width}>
      <PageHeader title={pageTitle} />
      <EmptyState
        headingLevel={2}
        icon={icon}
        title={title}
        description={description}
        action={<Button type="button" onClick={() => openAuthDialog({ to, reason })}>Sign in</Button>}
      />
    </Page>
  )
}

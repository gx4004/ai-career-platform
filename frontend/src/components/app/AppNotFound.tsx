import { useEffect } from 'react'
import { Link, useCanGoBack, useRouter } from '@tanstack/react-router'
import { Search } from 'lucide-react'
import { StatePage } from '#/components/app/AppStatePanel'
import { openCommandPalette } from '#/components/app/CommandPalette'
import { Button, Kbd, List, Page, Row, RowBody, RowLeading, RowSubtitle, RowTitle, Section, ToolTile } from '#/components/kit'
import { useShortcutLabel } from '#/hooks/use-mod-key'
import { useSession } from '#/hooks/useSession'
import { toolList } from '#/lib/tools/registry'

const NOT_FOUND_TITLE = 'Page not found | Career Workbench'

/**
 * The 404: a big lemon seal, one line on what happened, and the way out. When the visitor came from another
 * page of the app, "Go back" to it is the one primary action; otherwise it is the dashboard (home for a guest).
 */
export function AppNotFound() {
  const { status } = useSession()
  const signedIn = status === 'authenticated'
  const router = useRouter()
  const searchShortcut = useShortcutLabel('K')
  // The router's own history index: true only when the previous entry is a page of this app, never another site.
  const canGoBack = useCanGoBack()

  // The root head only knows "Career Workbench"; tab lists and screen readers should hear that this is a 404.
  // On the way out the next route's head has usually written its own title already (same commit, before this
  // passive cleanup), so the old title is put back only while the 404's is still showing.
  useEffect(() => {
    const previous = document.title
    document.title = NOT_FOUND_TITLE
    return () => {
      if (document.title === NOT_FOUND_TITLE) document.title = previous
    }
  }, [])

  const home = signedIn
    ? { to: '/dashboard', label: 'Back to the dashboard' }
    : { to: '/', label: 'Back to home' }

  return (
    <Page>
      <StatePage
        seal={{ value: '404', label: 'Error 404', tone: 'lemon' }}
        code="Page not found"
        title="This page doesn't exist"
        description="The link may be out of date or mistyped. Search for what you were after, or head back."
        actions={
          <>
            {canGoBack ? (
              <Button type="button" onClick={() => router.history.back()}>
                Go back
              </Button>
            ) : null}
            <Button asChild variant={canGoBack ? 'secondary' : 'primary'}>
              <Link to={home.to}>{home.label}</Link>
            </Button>
          </>
        }
      />
      <Button type="button" variant="secondary" className="not-found-search" onClick={openCommandPalette}>
        <Search aria-hidden />
        <span>Search tools, pages and runs</span>
        <Kbd className="not-found-search__kbd">{searchShortcut}</Kbd>
      </Button>
      <Section title="Or open a tool" className="not-found-tools">
        <List aria-label="Tools">
          {toolList.map((tool) => (
            <Row key={tool.id}>
              <RowLeading>
                <ToolTile tone={tool.tone} icon={tool.icon} size="md" />
              </RowLeading>
              <RowBody>
                <RowTitle asChild>
                  <Link to={tool.route}>{tool.label}</Link>
                </RowTitle>
                <RowSubtitle>{tool.summary}</RowSubtitle>
              </RowBody>
            </Row>
          ))}
        </List>
      </Section>
    </Page>
  )
}

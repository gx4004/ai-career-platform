import { Link } from '@tanstack/react-router'
import { Button, List, Page, PageHeader, Row, RowBody, RowSubtitle, RowTitle, Section } from '#/components/kit'
import { useSession } from '#/hooks/useSession'
import { toolList } from '#/lib/tools/registry'

export function AppNotFound() {
  const { status } = useSession()
  const signedIn = status === 'authenticated'
  return (
    <Page>
      <PageHeader
        title="Page not found"
        lead="This page does not exist, or the link is out of date."
        meta={['404']}
        actions={
          signedIn ? (
            <>
              <Button asChild variant="secondary" size="sm">
                <Link to="/">Back to home</Link>
              </Button>
              <Button asChild size="sm">
                <Link to="/dashboard">Go to dashboard</Link>
              </Button>
            </>
          ) : (
            <Button asChild size="sm">
              <Link to="/">Back to home</Link>
            </Button>
          )
        }
      />
      <Section title="Or open a tool" className="not-found-tools">
        <List aria-label="Tools">
          {toolList.map((tool) => (
            <Row key={tool.id}>
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

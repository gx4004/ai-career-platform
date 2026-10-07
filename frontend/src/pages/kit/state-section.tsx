import { useState } from 'react'
import { SearchX, Star } from 'lucide-react'
import {
  Button,
  Card,
  Cluster,
  EmptyState,
  ErrorState,
  List,
  MetaRow,
  Row,
  RowBody,
  RowMeta,
  RowSubtitle,
  RowTitle,
  Section,
  Segmented,
  Skeleton,
  Stat,
} from '#/components/kit'
import { DemoLink, GallerySection, Group, Row as GalleryRow, Specimen } from './gallery-parts'
import { RUNS } from './sample-data'

function Retry() {
  const [retrying, setRetrying] = useState(false)
  return (
    <ErrorState
      headingLevel={3}
      title="Your applications couldn't be loaded"
      description="Something went wrong on our side. Your applications are safe."
      retrying={retrying}
      onRetry={() => {
        setRetrying(true)
        window.setTimeout(() => setRetrying(false), 1500)
      }}
    />
  )
}

function Swap() {
  const [loading, setLoading] = useState(true)
  return (
    <div className="kit-gallery__stack">
      <GalleryRow>
        <Segmented
          aria-label="Loaded or loading"
          size="sm"
          value={loading ? 'loading' : 'loaded'}
          onValueChange={(value) => setLoading(value === 'loading')}
          options={[
            { value: 'loading', label: 'Loading' },
            { value: 'loaded', label: 'Loaded' },
          ]}
        />
      </GalleryRow>
      <div data-testid="swap-rows">
        {loading ? (
          <List aria-label="Runs" aria-busy="true" boxed>
            <Skeleton variant="row" as="li" count={RUNS.length} />
          </List>
        ) : (
          <List aria-label="Runs" boxed>
            {RUNS.map((run) => (
              <Row key={run.id}>
                <RowBody>
                  <RowTitle>{run.label}</RowTitle>
                  <RowSubtitle>
                    <MetaRow>
                      <span>{run.tool}</span>
                    </MetaRow>
                  </RowSubtitle>
                </RowBody>
                <RowMeta>{run.date}</RowMeta>
              </Row>
            ))}
          </List>
        )}
      </div>
    </div>
  )
}

/** focusTitle: the outcome that replaces a submitted form takes focus on its heading (press the button with the keyboard). */
function Outcome() {
  const [done, setDone] = useState(false)
  return (
    <div className="kit-gallery__stack">
      {done ? (
        <EmptyState
          variant="open"
          headingLevel={3}
          focusTitle
          title="Password updated"
          description="Sign in with your new password to continue."
          action={
            <Button type="button" variant="secondary" onClick={() => setDone(false)}>
              Show the form again
            </Button>
          }
        />
      ) : (
        <GalleryRow>
          <Button type="button" variant="secondary" onClick={() => setDone(true)}>
            Reset password
          </Button>
        </GalleryRow>
      )}
    </div>
  )
}

export function StateSection() {
  return (
    <GallerySection
      id="state"
      title="EmptyState, ErrorState, Skeleton"
      note="Empty and error states are one shape: the die-cut panel (dashed outline) with an optional icon disc, a display line, one sentence and at most one action, left-aligned. Skeletons are calm: a slow opacity pulse, none at all under reduced motion, and exactly as tall as the thing they stand in for."
    >
      <Group title="EmptyState">
        <div className="kit-gallery__grid kit-gallery__grid--wide">
          <Specimen label="compact, with an action: md, whatever size is passed (sm only inline)">
            <EmptyState
              title="No applications yet"
              description="Add a job from Discover, or let us prepare applications for you below."
              action={
                <Button variant="secondary" size="sm">
                  Discover jobs
                </Button>
              }
            />
          </Specimen>
          <Specimen label="compact, two actions: the next step primary, the alternative secondary">
            <EmptyState
              icon={<Star />}
              title="Pick up where you left off"
              description="Sign in to keep your runs and starred results."
              action={
                <Cluster gap={2}>
                  <Button>Sign in</Button>
                  <Button variant="secondary">Start with Resume</Button>
                </Cluster>
              }
            />
          </Specimen>
          <Specimen label="icon: the starred empty of dashboard.png (lemon disc, tilted -8deg)">
            <EmptyState icon={<Star />} title="No starred results" description="Star a result and it lands here." />
          </Specimen>
          <Specimen label="compact, title only">
            <EmptyState title="You have seen every match" />
          </Specimen>
          <Specimen label="inline: a quiet placeholder in a narrow slot (board column, side rail)">
            <div className="kit-gallery__narrow">
              <EmptyState size="inline" title="Offers on the table" />
            </div>
          </Specimen>
          <Specimen label="inline, a sentence: runs as body text across the column, flush with the heading above">
            <Section headingLevel={3} size="sm" title="Facts from your profile">
              <EmptyState size="inline" title="You haven’t saved any facts on your profile yet, so this CV will start blank." />
            </Section>
          </Specimen>
          <Specimen label="inline slot: the dashed 72px place a card would take (an empty board column)">
            <div className="kit-gallery__narrow">
              <EmptyState size="inline" variant="slot" title="Offers on the table" />
            </div>
          </Specimen>
          <Specimen label="compact, long text">
            <EmptyState
              title="Connect employer boards to see their openings here, or paste a job description yourself"
              description="Once you confirm evidence in your profile, the jobs that fit your skills best appear here, ranked by how many of the posting's skills you can show. New openings arrive every morning and appear at the top."
            />
          </Specimen>
        </div>
        <Specimen label="page level">
          <div className="kit-gallery__frame">
            <EmptyState
              size="page"
              headingLevel={2}
              title="Nothing saved yet"
              description="Run a tool and the result is kept here, so you can compare it with the next one."
              action={<Button>Start with Resume</Button>}
            />
          </div>
        </Specimen>
      </Group>

      <Group title="ErrorState">
        <div className="kit-gallery__grid kit-gallery__grid--wide">
          <Specimen label="compact, retry (press Try again: the button shows a spinner)">
            <Retry />
          </Specimen>
          <Specimen label="with an icon (rose disc)">
            <ErrorState icon={<SearchX />} title="No results for that search" description="Try a shorter title or fewer filters." />
          </Specimen>
          <Specimen label="with detail">
            <ErrorState
              title="That CV could not be exported"
              description="The PDF service did not answer in time."
              detail="request 7f3c1a · export timed out after 30s"
              onRetry={() => undefined}
              retryLabel="Export again"
            />
          </Specimen>
        </div>
        <Specimen label="page level, with a code and a way back (role=status: a not-found page is calm, not an alert)">
          <div className="kit-gallery__frame">
            <ErrorState
              size="page"
              role="status"
              headingLevel={2}
              code="404"
              title="This application couldn't be opened"
              description="It may have been deleted, or the link is wrong."
              backAction={
                <Button asChild variant="secondary">
                  <DemoLink>All applications</DemoLink>
                </Button>
              }
            />
          </div>
        </Specimen>
      </Group>

      <Group title="Open variant: no frame, a display title and a lead sentence (a page that carries its own art beside the copy)">
        <Specimen label="variant=open, ErrorState with a way back; EmptyState open below">
          <div className="kit-gallery__frame kit-gallery__roomy">
            <ErrorState
              variant="open"
              role="status"
              headingLevel={2}
              code="404"
              title="That page isn't here"
              description="The link may be old, or the page moved."
              backAction={
                <Button asChild variant="secondary">
                  <DemoLink>Back to the dashboard</DemoLink>
                </Button>
              }
            />
            <EmptyState variant="open" headingLevel={2} title="Nothing saved yet" description="Run a tool and your results will be listed here." />
          </div>
        </Specimen>
        <Specimen label="focusTitle: an outcome that replaces the form takes focus on its heading (no ring, no tab stop)">
          <div className="kit-gallery__frame">
            <Outcome />
          </div>
        </Specimen>
      </Group>

      <Group title="Skeleton">
        <div className="kit-gallery__grid kit-gallery__grid--wide">
          <Specimen label="line: body, three lines (last is shorter)">
            <Skeleton lines={3} />
          </Specimen>
          <Specimen label="line: sizes (meta, body, title, display), widths">
            <div className="kit-gallery__stack">
              <Skeleton size="meta" width="40%" />
              <Skeleton size="body" width="70%" />
              <Skeleton size="title" width="55%" />
              <Skeleton size="display" width="12rem" />
            </div>
          </Specimen>
          <Specimen label="block (any shape)">
            <Skeleton variant="block" width="100%" height={72} />
          </Specimen>
          <Specimen label='block shape="circle": a round placeholder for an Avatar'>
            <Skeleton variant="block" shape="circle" width={36} height={36} />
          </Specimen>
          <Specimen label="stat">
            <Skeleton variant="stat" count={3} />
          </Specimen>
          <Specimen label="card">
            <Skeleton variant="card" count={2} />
          </Specimen>
          <Specimen label="row: compact / comfortable / with a leading square / with a tool tile / with a fit stamp">
            <div className="kit-gallery__stack">
              <Skeleton variant="row" density="compact" count={2} />
              <Skeleton variant="row" count={2} />
              <Skeleton variant="row" leading count={2} />
              <Skeleton variant="row" leading="tile" count={2} />
              <Skeleton variant="row" leading="stamp" count={2} />
            </div>
          </Specimen>
          <Specimen label="row lines and trailing: lines={2} with a tool tile (History) / lines={2} trailing=&quot;button&quot; (Discover) / trailing=&quot;pips&quot; / the button row in a phone-width List, where it drops under the text and narrowLines={4} stands in for the wrapped title and the dropped meta">
            <div className="kit-gallery__stack">
              <Skeleton variant="row" leading="tile" lines={2} count={2} />
              <Skeleton variant="row" lines={2} trailing="button" count={2} />
              <Skeleton variant="row" leading="stamp" trailing="pips" count={2} />
              <div className="kit-gallery__frame kit-gallery__frame--phone">
                <List aria-label="Jobs (loading, phone)" aria-busy="true">
                  <Skeleton variant="row" as="li" leading="stamp" lines={2} narrowLines={4} trailing="button" count={2} />
                </List>
              </div>
            </div>
          </Specimen>
          <Specimen label="row heading: a day-grouped List (History) opens with the ListHeading strip, so the rows do not drop when the &quot;Yesterday&quot; heading arrives">
            <List aria-label="Saved runs (loading)" aria-busy="true">
              <Skeleton variant="row" as="li" heading leading="tile" lines={2} narrowLines={4} count={2} />
            </List>
          </Specimen>
          <Specimen label="header: the PageHeader alone (a page that draws its own section skeletons)">
            <Skeleton variant="header" />
          </Specimen>
          <Specimen label="sticker: plates in place of Stickers (Needs action), no frame">
            <Skeleton variant="sticker" count={2} />
          </Specimen>
        </div>
        <Specimen label="Loading to loaded: the list below keeps its height (no layout shift)">
          <Swap />
        </Specimen>
        <Specimen label="page (for a route with nothing yet)">
          <div className="kit-gallery__frame kit-gallery__frame--wide">
            <Skeleton variant="page" label="Loading the page" />
          </div>
        </Specimen>
        <Specimen label="Stat and Card next to their skeletons for comparison">
          <div className="kit-gallery__grid">
            <Stat label="Applications" value={7} />
            <Skeleton variant="stat" />
            <Card>
              <strong>Northwind Labs</strong>
              <MetaRow>
                <span>Interview</span>
              </MetaRow>
            </Card>
            <Skeleton variant="card" />
          </div>
        </Specimen>
      </Group>
    </GallerySection>
  )
}

import { useState } from 'react'
import { SearchX, Star } from 'lucide-react'
import {
  Button,
  Card,
  EmptyState,
  ErrorState,
  List,
  MetaRow,
  Row,
  RowBody,
  RowMeta,
  RowSubtitle,
  RowTitle,
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

export function StateSection() {
  return (
    <GallerySection
      id="state"
      title="EmptyState, ErrorState, Skeleton"
      note="Empty and error states are one shape: the die-cut panel (dashed outline) with an optional icon disc, a display line, one sentence and at most one action, left-aligned. Skeletons are calm: a slow opacity pulse, none at all under reduced motion, and exactly as tall as the thing they stand in for."
    >
      <Group title="EmptyState">
        <div className="kit-gallery__grid kit-gallery__grid--wide">
          <Specimen label="compact, with an action">
            <EmptyState
              title="No applications yet"
              description="Add a job from Discover, or let us prepare applications for you below."
              action={
                <Button variant="secondary" size="sm">
                  Find jobs
                </Button>
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
          <Specimen label="stat">
            <Skeleton variant="stat" count={3} />
          </Specimen>
          <Specimen label="card">
            <Skeleton variant="card" count={2} />
          </Specimen>
          <Specimen label="row: compact / comfortable / with a leading square">
            <div className="kit-gallery__stack">
              <Skeleton variant="row" density="compact" count={2} />
              <Skeleton variant="row" count={2} />
              <Skeleton variant="row" leading count={2} />
            </div>
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

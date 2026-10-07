import { useState } from 'react'
import { ArrowDown, ArrowUp, MoreHorizontal, Pin, Trash2 } from 'lucide-react'
import {
  Badge,
  Button,
  Card,
  CardActions,
  CardHeader,
  CardTitle,
  Cluster,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  List,
  MetaRow,
  Notice,
  Row,
  RowBody,
  RowMeta,
  RowTitle,
  ScoreBar,
  Section,
  StageMark,
  StretchedLink,
} from '#/components/kit'
import { DemoLink, GallerySection, Group, Specimen } from './gallery-parts'
import { APPLICATIONS } from './sample-data'

function SimpleRows({ count }: { count: number }) {
  return (
    <List aria-label="Specimen rows">
      {Array.from({ length: count }, (_, index) => (
        <Row key={index} density="compact">
          <RowBody>
            <RowTitle>Document {index + 1}</RowTitle>
          </RowBody>
          <RowMeta>Sep {29 - index}</RowMeta>
        </Row>
      ))}
    </List>
  )
}

function Dismissible() {
  const [open, setOpen] = useState(true)
  if (!open)
    return (
      <Button size="sm" variant="secondary" onClick={() => setOpen(true)}>
        Bring the notice back
      </Button>
    )
  return (
    <Notice
      title="Guest demo"
      action={
        <Button size="sm" variant="secondary">
          Sign in to save
        </Button>
      }
      onDismiss={() => setOpen(false)}
    >
      Results are not saved until you sign in.
    </Notice>
  )
}

function ApplicationCard({ index, selected = false, placement }: { index: number; selected?: boolean; placement?: 'inline' | 'overlay' }) {
  const application = APPLICATIONS[index]
  return (
    <Card selected={selected}>
      <CardHeader>
        <CardTitle headingLevel={3} asChild>
          <DemoLink>{application.role}</DemoLink>
        </CardTitle>
        {index === 0 ? <Pin className="kit-gallery__pin" aria-label="Pinned" role="img" /> : null}
        <CardActions placement={placement}>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button iconOnly variant="ghost" size="sm" aria-label={`Move ${application.role}`}>
                <MoreHorizontal aria-hidden="true" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem>Move to Applied</DropdownMenuItem>
              <DropdownMenuItem>Move to Interview</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </CardActions>
      </CardHeader>
      <MetaRow>
        <span>{application.company}</span>
        {application.fit !== null ? <span>{application.fit}% fit</span> : null}
        <span>{application.age}</span>
      </MetaRow>
      <div className="kit-gallery__badges">
        <Badge tone={application.tone}>{application.stage}</Badge>
        {application.next ? <span className="kit-gallery__quiet">{application.next}</span> : null}
      </div>
    </Card>
  )
}

export function SurfaceSection() {
  return (
    <GallerySection
      id="surface"
      title="Section, Notice, Card"
      note="Section is the one heading row. Notice is the one inline banner. Card is only for real objects (a job, an application): lists, tables and sections never go in cards."
    >
      <Group title="Section">
        <div className="kit-gallery__grid kit-gallery__grid--wide">
          <Specimen label="title, count, action; a framed list under it">
            <Section title="Documents" count={3} actions={<Button size="sm" variant="secondary">Add document</Button>}>
              <SimpleRows count={3} />
            </Section>
          </Specimen>
          <Specimen label="with a description; free content gets 16px">
            <Section title="Prepare for me" description="We draft a cover letter and a tailored CV for each job you add.">
              <p className="kit-gallery__paragraph">Content under the description keeps a 16px gap.</p>
            </Section>
          </Specimen>
          <Specimen label="description and an action: on a phone the action follows the description (heading, why, what to do)">
            <Section
              title="Saved facts"
              description="What you confirmed. CV Studio and the tools draw on these."
              actions={<Button size="sm" variant="secondary">Start a CV from these facts</Button>}
            >
              <SimpleRows count={2} />
            </Section>
          </Specimen>
          <Specimen label="rule: a 2px ink rule under the heading row">
            <Section title="Notes" rule>
              <p className="kit-gallery__paragraph">A heading without the rule (the default), for sections inside a card or a rail.</p>
            </Section>
          </Specimen>
          <Specimen label="size=card: display 20/800 (h-card), a narrow column's heading beside its StageMark (the applications board)">
            <div style={{ maxInlineSize: '13rem' }}>
              <Section
                headingLevel={3}
                size="card"
                title={
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 'var(--s3)' }}>
                    <StageMark stage="interviewing" variant="count" count={2} />
                    Interviewing
                  </span>
                }
              >
                <SimpleRows count={1} />
              </Section>
            </div>
          </Specimen>
          <Specimen label="size=sm: a group inside a disclosure or another section">
            <Section headingLevel={3} size="sm" title="Kind of role">
              <SimpleRows count={2} />
            </Section>
          </Specimen>
          <Specimen label="actionsWrap={false}: one short control that belongs to its heading stays beside it in a narrow column (Start a new CV at 320); the title wraps instead">
            <div style={{ maxInlineSize: '15rem' }} data-specimen="section-actions-nowrap">
              <Section
                headingLevel={3}
                size="sm"
                title="Facts from your profile"
                actionsWrap={false}
                actions={<Button type="button" size="sm" variant="ghost">Select all</Button>}
              >
                <SimpleRows count={2} />
              </Section>
            </div>
          </Specimen>
          <Specimen label="size=xs: an object's name in a narrow card (a CV entry), set as a row title; actions wrap under it by default">
            <div style={{ maxInlineSize: '20rem' }}>
              <Card padding="sm">
                <Section
                  headingLevel={3}
                  size="xs"
                  title="B.S. Computer Science, University of Texas"
                  actions={
                    <>
                      <Button type="button" iconOnly variant="ghost" size="sm" aria-label="Move up"><ArrowUp aria-hidden="true" /></Button>
                      <Button type="button" iconOnly variant="ghost" size="sm" aria-label="Move down"><ArrowDown aria-hidden="true" /></Button>
                      <Button type="button" iconOnly variant="ghost" size="sm" aria-label="Delete"><Trash2 aria-hidden="true" /></Button>
                    </>
                  }
                >
                  <p className="kit-gallery__paragraph">15/700 UI type, the row title's size: under the 17px section row and over 14px field labels.</p>
                </Section>
              </Card>
            </div>
          </Specimen>
          <Specimen label="size=xs + actionsWrap={false}: a CV entry card; the name wraps beside its tools, which stay at its first line (4px apart under a mouse)">
            <div style={{ maxInlineSize: '20rem' }} data-specimen="section-xs-nowrap">
              <Card padding="sm">
                <Section
                  headingLevel={3}
                  size="xs"
                  actionsWrap={false}
                  title="B.S. Computer Science, University of Texas"
                  actions={
                    <>
                      <Button type="button" iconOnly variant="ghost" size="sm" aria-label="Move up"><ArrowUp aria-hidden="true" /></Button>
                      <Button type="button" iconOnly variant="ghost" size="sm" aria-label="Move down"><ArrowDown aria-hidden="true" /></Button>
                      <Button type="button" iconOnly variant="ghost" size="sm" aria-label="Delete"><Trash2 aria-hidden="true" /></Button>
                    </>
                  }
                >
                  <p className="kit-gallery__paragraph">The CV Studio entry card heading.</p>
                </Section>
              </Card>
            </div>
          </Specimen>
          <Specimen label="headingLevel=3, long title, several actions wrapping">
            <Section
              headingLevel={3}
              title="Interview preparation for the second-round technical conversation with the staff engineer"
              count={12}
              actions={
                <>
                  <Button size="sm" variant="secondary">
                    Regenerate
                  </Button>
                  <Button size="sm" variant="secondary">
                    Export
                  </Button>
                  <Button size="sm">Practise</Button>
                </>
              }
            >
              <SimpleRows count={2} />
            </Section>
          </Specimen>
        </div>
      </Group>

      <Group title="Notice">
        <div className="kit-gallery__stack kit-gallery__bounded--wide">
          <Notice>Carried over from Resume.</Notice>
          <Notice tone="success" title="CV saved">
            Backend roles is up to date.
          </Notice>
          <Notice tone="warning" title="Your CV mentions Kubernetes but the posting asks for Nomad">
            Check the skills section before you send it.
          </Notice>
          <Notice tone="danger" title="That job could not be added" action={<Button size="sm" variant="secondary">Try again</Button>}>
            Something went wrong on our side.
          </Notice>
          <Notice tone="info" title="Guest runs are not saved" icon={false}>
            Sign in to keep this result and compare it with the next one.
          </Notice>
          <Dismissible />
          {/* actionPlacement="below": a choice of two sits under the text, and spans the notice on a phone. */}
          <Notice
            title="Imported the posting from jobs.example.com"
            actionPlacement="below"
            action={
              <>
                <Button size="sm" variant="secondary">
                  Replace
                </Button>
                <Button size="sm" variant="ghost">
                  Keep mine
                </Button>
              </>
            }
          >
            Your job description below already has text. Replace it with the posting, or keep yours?
          </Notice>
          <Notice tone="danger">
            A very long message with a long unbroken address that must wrap and not widen the page:
            https://api.example.com/v1/discovery/listings/0b6d4f1e-0000-4000-8000-1234567890ab/deep-match
          </Notice>
        </div>
      </Group>

      <Group title="Card: only for objects">
        <div className="kit-gallery__grid">
          <Specimen label="application (title is the whole-card link; the menu sits above it)">
            <ApplicationCard index={0} />
          </Specimen>
          <Specimen label="selected">
            <ApplicationCard index={1} selected />
          </Specimen>
          <Specimen label="actions placement=overlay: the title keeps the whole line, the menu floats in on hover">
            <ApplicationCard index={0} placement="overlay" />
          </Specimen>
          <Specimen label="missing fields">
            <ApplicationCard index={2} />
          </Specimen>
          <Specimen label="plain card, with a ScoreBar (not interactive: no hover border)">
            <Card>
              <Cluster justify="between" gap={3}>
                <strong>Skills fit</strong>
                <span>7 of 8 skills</span>
              </Cluster>
              <ScoreBar aria-label="Skills fit" value={88} valueLabel="88%" />
            </Card>
          </Specimen>
          <Specimen label="StretchedLink on its own (card made clickable)">
            <Card interactive>
              <StretchedLink asChild>
                <DemoLink>Open the application</DemoLink>
              </StretchedLink>
              <span className="kit-gallery__quiet">The link covers the card; hover darkens the border.</span>
            </Card>
          </Specimen>
        </div>
      </Group>
    </GallerySection>
  )
}

import { useState } from 'react'
import { MoreHorizontal, Pin } from 'lucide-react'
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

function ApplicationCard({ index, selected = false }: { index: number; selected?: boolean }) {
  const application = APPLICATIONS[index]
  return (
    <Card selected={selected}>
      <CardHeader>
        <CardTitle headingLevel={3} asChild>
          <DemoLink>{application.role}</DemoLink>
        </CardTitle>
        {index === 0 ? <Pin className="kit-gallery__pin" aria-label="Pinned" role="img" /> : null}
        <CardActions>
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
          <Specimen label="title, count, action; list sits under the hairline">
            <Section title="Documents" count={3} actions={<Button size="sm" variant="secondary">Add document</Button>}>
              <SimpleRows count={3} />
            </Section>
          </Specimen>
          <Specimen label="with a description; free content gets 12px">
            <Section title="Prepare for me" description="We draft a cover letter and a tailored CV for each job you add.">
              <p className="kit-gallery__paragraph">Content under the description keeps a 12px gap.</p>
            </Section>
          </Specimen>
          <Specimen label="no rule (rule={false})">
            <Section title="Notes" rule={false}>
              <p className="kit-gallery__paragraph">A heading without the hairline, for sections inside a card or a rail.</p>
            </Section>
          </Specimen>
          <Specimen label="size=sm: a group inside a disclosure or another section">
            <Section headingLevel={3} size="sm" title="Kind of role">
              <SimpleRows count={2} />
            </Section>
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

import { useState } from 'react'
import { FileText, MoreHorizontal, Pencil, Plus, Star, Trash2 } from 'lucide-react'
import {
  Badge,
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  Disclosure,
  EmptyState,
  FitStamp,
  List,
  MetaRow,
  ScoreBar,
  Row,
  RowActions,
  RowBody,
  RowLeading,
  RowMeta,
  RowReveal,
  RowSubtitle,
  RowTitle,
  Segmented,
  Skeleton,
  SkillPips,
  type RowDensity,
  type RowOverflow,
} from '#/components/kit'
import { DemoLink, GallerySection, Group, Row as GalleryRow, Specimen } from './gallery-parts'
import { FIXES, JOBS, RUNS, type Job, type RunRow } from './sample-data'

const INLINE_RUNS: RunRow[] = [
  { id: 'i1', tool: 'Resume', label: 'Resume for Staff Engineer, Data Platform', date: 'Sep 22', score: 79 },
  { id: 'i2', tool: 'Letter', label: 'Cover letter, Quillon', date: 'Sep 20', score: null },
]

function JobRow({
  job,
  density,
  overflow,
  selected,
  onOpen,
}: {
  job: Job
  density: RowDensity
  overflow: RowOverflow
  selected: boolean
  onOpen: (id: string) => void
}) {
  return (
    <Row density={density} overflow={overflow} selected={selected}>
      <RowBody>
        <RowTitle headingLevel={3} asChild>
          <button type="button" onClick={() => onOpen(job.id)}>
            {job.title}
          </button>
        </RowTitle>
        <RowSubtitle>
          <MetaRow>
            <strong>{job.company}</strong>
            {job.location}
            {job.remote ? 'Remote' : null}
            {job.posted}
            {job.source ? `via ${job.source}` : null}
          </MetaRow>
        </RowSubtitle>
      </RowBody>
      {job.fit !== null ? (
        <RowMeta>
          <ScoreBar aria-label={`${job.fit}% skills fit`} layout="inline" size="sm" value={job.fit} valueLabel={`${job.fit}%`} />
        </RowMeta>
      ) : null}
      <RowActions reveal={false}>
        <Button size="sm" variant="secondary" aria-label={`Add ${job.title} to applications`}>
          Add
        </Button>
        <RowReveal>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button iconOnly variant="ghost" size="sm" aria-label={`More actions for ${job.title}`}>
                <MoreHorizontal aria-hidden="true" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem>Deep match</DropdownMenuItem>
              <DropdownMenuItem>Tailor my CV</DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem destructive>Hide this job</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </RowReveal>
      </RowActions>
    </Row>
  )
}

function JobList() {
  const [density, setDensity] = useState<RowDensity>('comfortable')
  const [overflow, setOverflow] = useState<RowOverflow>('wrap')
  const [selected, setSelected] = useState<string | null>('j1')
  const [loading, setLoading] = useState(false)
  return (
    <div className="kit-gallery__stack">
      <GalleryRow>
        <Segmented
          aria-label="Row density"
          size="sm"
          value={density}
          onValueChange={setDensity}
          options={[
            { value: 'compact', label: 'Compact 40' },
            { value: 'comfortable', label: 'Comfortable 44' },
          ]}
        />
        <Segmented
          aria-label="Long titles"
          size="sm"
          value={overflow}
          onValueChange={setOverflow}
          options={[
            { value: 'wrap', label: 'Wrap' },
            { value: 'truncate', label: 'Truncate' },
          ]}
        />
        <Button size="sm" variant="secondary" aria-pressed={loading} onClick={() => setLoading((value) => !value)}>
          Show loading
        </Button>
      </GalleryRow>
      {loading ? (
        <List aria-label="Jobs" aria-busy="true" boxed>
          <Skeleton variant="row" as="li" count={JOBS.length} density={density} />
        </List>
      ) : (
        <List aria-label="Jobs" boxed>
          {JOBS.map((job) => (
            <JobRow key={job.id} job={job} density={density} overflow={overflow} selected={selected === job.id} onOpen={setSelected} />
          ))}
        </List>
      )}
    </div>
  )
}

function HistoryList({ rows, collapse, label }: { rows: RunRow[]; collapse: boolean; label: string }) {
  const [starred, setStarred] = useState<Record<string, boolean>>({ r2: true })
  return (
    <List aria-label={label}>
      {rows.map((run) => (
        <Row key={run.id}>
          <RowLeading>
            <FileText aria-hidden="true" />
          </RowLeading>
          <RowBody>
            <RowTitle asChild>
              <DemoLink>{run.label}</DemoLink>
            </RowTitle>
            <RowSubtitle>
              <MetaRow>
                <span>{run.tool}</span>
                {run.score !== null ? <span>Score {run.score}</span> : null}
              </MetaRow>
            </RowSubtitle>
          </RowBody>
          <RowMeta>{run.date}</RowMeta>
          <RowActions
            collapse={
              collapse ? (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button iconOnly variant="ghost" size="sm" aria-label={`Actions for ${run.label}`}>
                      <MoreHorizontal aria-hidden="true" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem
                      icon={<Star />}
                      onSelect={() => setStarred((current) => ({ ...current, [run.id]: !current[run.id] }))}
                    >
                      {starred[run.id] ? 'Remove from favourites' : 'Favourite'}
                    </DropdownMenuItem>
                    <DropdownMenuItem icon={<Pencil />}>Rename</DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem destructive icon={<Trash2 />}>
                      Delete
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              ) : undefined
            }
          >
            <Button
              iconOnly
              variant="ghost"
              size="sm"
              aria-label={starred[run.id] ? `Remove ${run.label} from favourites` : `Favourite ${run.label}`}
              aria-pressed={Boolean(starred[run.id])}
              onClick={() => setStarred((current) => ({ ...current, [run.id]: !current[run.id] }))}
            >
              <Star aria-hidden="true" fill={starred[run.id] ? 'currentColor' : 'none'} />
            </Button>
            <Button iconOnly variant="ghost" size="sm" aria-label={`Rename ${run.label}`}>
              <Pencil aria-hidden="true" />
            </Button>
            <Button iconOnly variant="ghost" size="sm" aria-label={`Delete ${run.label}`}>
              <Trash2 aria-hidden="true" />
            </Button>
          </RowActions>
        </Row>
      ))}
    </List>
  )
}

function ManyRows() {
  return (
    <Disclosure variant="inline" title="Show 40 compact rows">
      <List aria-label="Forty rows" boxed>
        {Array.from({ length: 40 }, (_, index) => (
          <Row key={index} density="compact" interactive>
            <RowBody>
              <RowTitle>{`Run ${40 - index}: ${RUNS[index % RUNS.length].label}`}</RowTitle>
            </RowBody>
            <RowMeta>Sep {(index % 28) + 1}</RowMeta>
          </Row>
        ))}
      </List>
    </Disclosure>
  )
}

export function ListSection() {
  return (
    <GallerySection
      id="list"
      title="List, Row"
      note="One row for every list: lead, text, meta, actions. Titles wrap by default (truncating is a choice you make per list). Hover over a row to reveal its secondary actions; on any device with a touchscreen (a phone, a tablet, a touchscreen laptop) they are always visible, and they appear while focus is inside the row. The primary action (Add) never hides. Narrow the window under 32rem of list width (or open this on a phone) to see the phone rule: every row with actions keeps them on its first line and its meta drops under the text."
    >
      <Group title="Jobs (Discover style): a 200-character title, missing fields, an Arabic title, a selected row">
        <JobList />
      </Group>

      <Group title="Saved runs (History style): the title is the whole-row link, so click anywhere; star, rename and delete sit above it and appear on hover. On a phone the three collapse into one menu (RowActions collapse)">
        <HistoryList rows={RUNS} collapse label="Saved runs" />
      </Group>

      <Group title="Same row without collapse: on a narrow list the three icon actions stay at the end of the first line and the date drops under the text">
        <HistoryList rows={INLINE_RUNS} collapse={false} label="Saved runs, inline actions" />
      </Group>

      <Group title="Overlay actions (RowActions placement=&quot;overlay&quot;): in a narrow rail the hidden Delete keeps only one icon's room at the row end and floats there on hover, never over the text; on touch it stays inline">
        <div className="kit-gallery__bounded">
          <Specimen label="unframed list in a 236px column">
            <div style={{ maxWidth: 236 }}>
              <List aria-label="Tasks (overlay specimen)" framed={false}>
                {['Prepare system design examples', 'Send the portfolio link'].map((title) => (
                  <Row key={title} density="compact">
                    <RowBody>{title}</RowBody>
                    <RowActions placement="overlay">
                      <Button type="button" iconOnly size="sm" variant="ghost" aria-label={`Delete task ${title}`}>
                        <Trash2 aria-hidden="true" />
                      </Button>
                    </RowActions>
                  </Row>
                ))}
              </List>
            </div>
          </Specimen>
        </div>
      </Group>

      <Group title="Parity with dashboard.png: the matches panel (FitStamp, 17px titles, SkillPips, secondary Add)">
        <div className="kit-gallery__bounded kit-gallery__bounded--wide">
        <Specimen label="comfortable match rows">
          <List aria-label="Best matches">
            {[
              { id: 'm1', title: 'Senior Backend Engineer, Platform', company: 'Northwind Labs', where: 'Berlin, Germany', fit: 94, matched: 8, total: 8 },
              { id: 'm2', title: 'DevOps Engineer', company: 'Northwind Labs', where: 'Munich, Germany', fit: 73, matched: 5, total: 7 },
              { id: 'm3', title: 'Data Analyst', company: 'Harbor Health', where: 'Remote, EU', fit: 64, matched: 3, total: 6 },
            ].map((job) => (
              <Row key={job.id}>
                <RowLeading>
                  <FitStamp value={job.fit} />
                </RowLeading>
                <RowBody>
                  <RowTitle size="lg">{job.title}</RowTitle>
                  <RowSubtitle>
                    <MetaRow>
                      <strong>{job.company}</strong>
                      {job.where}
                    </MetaRow>
                  </RowSubtitle>
                </RowBody>
                <RowMeta>
                  <SkillPips matched={job.matched} total={job.total} />
                </RowMeta>
                <RowActions reveal={false}>
                  <Button size="sm" variant="secondary">
                    <Plus aria-hidden="true" />
                    Add
                  </Button>
                </RowActions>
              </Row>
            ))}
          </List>
        </Specimen>
        </div>
      </Group>

      <div className="kit-gallery__grid kit-gallery__grid--wide">
        <Specimen label="Numbered (Fix first)">
          <List numbered aria-label="Fix first">
            {FIXES.map((fix) => (
              <Row key={fix.title}>
                <RowBody>
                  <RowTitle>{fix.title}</RowTitle>
                  <RowSubtitle>{fix.detail}</RowSubtitle>
                </RowBody>
                <RowMeta>
                  <Badge
                    tone={fix.level === 'High' ? 'danger' : fix.level === 'Medium' ? 'warning' : 'neutral'}
                    data-severity={fix.level.toLowerCase()}
                  >
                    {fix.level}
                  </Badge>
                </RowMeta>
              </Row>
            ))}
          </List>
        </Specimen>

        <Specimen label="Compact rows, one title only (40px)">
          <List aria-label="Compact" boxed>
            {RUNS.map((run) => (
              <Row key={run.id} density="compact" interactive>
                <RowBody>
                  <RowTitle>{run.label}</RowTitle>
                </RowBody>
                <RowMeta>{run.date}</RowMeta>
              </Row>
            ))}
          </List>
        </Specimen>

        <Specimen label="No rows: an EmptyState takes the list's place">
          <EmptyState title="No saved runs yet" description="Run a tool and the result is kept here." />
        </Specimen>

        <Specimen label="One row">
          <List aria-label="One row" boxed>
            <Row>
              <RowBody>
                <RowTitle>Only run so far</RowTitle>
                <RowSubtitle>Resume · Sep 29</RowSubtitle>
              </RowBody>
              <RowMeta>84</RowMeta>
            </Row>
          </List>
        </Specimen>

        <Specimen label="Many rows (collapsed to keep the page short)">
          <ManyRows />
        </Specimen>

        <Specimen label="Truncate, with a long title and an Arabic title (dir=auto cuts each at its own end)">
          <List aria-label="Truncated" boxed>
            {JOBS.filter((job) => ['j2', 'j5'].includes(job.id)).map((job) => (
              <Row key={job.id} overflow="truncate" interactive>
                <RowBody>
                  <RowTitle>{job.title}</RowTitle>
                  <RowSubtitle>
                    <MetaRow>
                      <strong>{job.company}</strong>
                      {job.location}
                      {job.posted}
                    </MetaRow>
                  </RowSubtitle>
                </RowBody>
                <RowMeta>{job.fit}%</RowMeta>
              </Row>
            ))}
          </List>
        </Specimen>

        <Specimen label="Right to left (dir=rtl on the container)">
          <div dir="rtl">
            <List aria-label="RTL" boxed>
              {JOBS.slice(3, 5).map((job) => (
                <Row key={job.id} selected={job.id === 'j5'}>
                  <RowBody>
                    <RowTitle>{job.title}</RowTitle>
                    <RowSubtitle>
                      <MetaRow>
                        <strong>{job.company}</strong>
                        {job.location}
                        {job.posted}
                      </MetaRow>
                    </RowSubtitle>
                  </RowBody>
                  <RowMeta>{job.fit}%</RowMeta>
                  <RowActions reveal={false}>
                    <Button size="sm" variant="secondary">
                      Add
                    </Button>
                  </RowActions>
                </Row>
              ))}
            </List>
          </div>
        </Specimen>
      </div>
    </GallerySection>
  )
}

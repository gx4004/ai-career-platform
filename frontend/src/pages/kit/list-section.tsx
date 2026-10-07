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
  ListHeading,
  MetaRow,
  NumberDisc,
  ScoreBar,
  Section,
  Stack,
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
  ToolTile,
  type RowDensity,
  type RowOverflow,
} from '#/components/kit'
import { tools } from '#/lib/tools/registry'
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
            { value: 'clamp', label: 'Clamp to 2 lines' },
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
                      {starred[run.id] ? 'Remove star' : 'Star'}
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
              // One name in both states; aria-pressed says whether it is starred (consistency-F28).
              aria-label={`Star ${run.label}`}
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

      <Group title="Running from a revealed menu (Discover's Deep match): the … trigger shows the spinner and stays in view after the pointer leaves, and the row says what is running">
        <List aria-label="Jobs (running specimen)">
          <Row>
            <RowBody>
              <RowTitle headingLevel={3}>Platform Engineer</RowTitle>
              <RowSubtitle>Acme Systems · Berlin</RowSubtitle>
              <p className="kit-gallery__paragraph" role="status">Running a deep match… this can take up to a minute.</p>
            </RowBody>
            <RowActions reveal={false}>
              <Button size="sm" variant="secondary" aria-label="Add Platform Engineer (running specimen) to applications">
                Add
              </Button>
              <RowReveal>
                <Button iconOnly loading variant="ghost" size="sm" aria-label="More actions for Platform Engineer (running specimen)">
                  <MoreHorizontal aria-hidden="true" />
                </Button>
              </RowReveal>
            </RowActions>
          </Row>
        </List>
      </Group>

      <Group title="Saved runs (History style): the title is the whole-row link, so click anywhere; star, rename and delete sit above it and appear on hover. On a phone the three collapse into one menu (RowActions collapse)">
        <HistoryList rows={RUNS} collapse label="Saved runs" />
      </Group>

      <Group title="ListHeading: day groups inside one List (History). Display 20/800 on the stone-soft strip, ruled off with the list's 2px --line; not a row (no hover, no number)">
        <List aria-label="Saved runs by day">
          <ListHeading>Today</ListHeading>
          {RUNS.slice(0, 2).map((run) => (
            <Row key={run.id}>
              <RowBody>
                <RowTitle>{run.label}</RowTitle>
                <RowSubtitle>{run.tool}</RowSubtitle>
              </RowBody>
              <RowMeta>{run.date}</RowMeta>
            </Row>
          ))}
          <ListHeading>Yesterday</ListHeading>
          {RUNS.slice(2).map((run) => (
            <Row key={run.id}>
              <RowBody>
                <RowTitle>{run.label}</RowTitle>
                <RowSubtitle>{run.tool}</RowSubtitle>
              </RowBody>
              <RowMeta>{run.date}</RowMeta>
            </Row>
          ))}
        </List>
      </Group>

      <Group title="Same row without collapse: on a narrow list the three icon actions stay at the end of the first line and the date drops under the text; at 320px (a list under 20rem) the actions take a line of their own under it, so the title keeps whole words">
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
          <Specimen label="flush list in a 236px column (the Tasks panel): the row still keeps the action's room at its end">
            <div style={{ maxWidth: 236 }}>
              <List aria-label="Tasks (flush overlay specimen)" framed={false} flush>
                {['Write to the hiring manager', 'Read the engineering blog'].map((title) => (
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

      <Group title="Leading disc or tile in a 236px list (a 320px dialog body, the onboarding tour): the text stays beside the leading slot, never under it">
        <div className="kit-gallery__bounded">
          <Specimen label="NumberDisc sm, then ToolTile md, in a 236px column">
            <Stack gap={4} style={{ maxWidth: 236 }} data-testid="row-leading-narrow">
              <List aria-label="What you get (narrow leading specimen)">
                {['Score your resume', 'Match it to a job'].map((title, index) => (
                  <Row key={title}>
                    <RowLeading>
                      <NumberDisc n={index + 1} size="sm" />
                    </RowLeading>
                    <RowBody>
                      <RowTitle>{title}</RowTitle>
                      <RowSubtitle>A short line of detail under the title.</RowSubtitle>
                    </RowBody>
                  </Row>
                ))}
              </List>
              <List aria-label="Tools (narrow leading specimen)">
                {[tools.resume, tools.interview].map((tool) => (
                  <Row key={tool.id}>
                    <RowLeading>
                      <ToolTile tone={tool.tone} icon={tool.icon} size="md" />
                    </RowLeading>
                    <RowBody>
                      <RowTitle>{tool.label}</RowTitle>
                      <RowSubtitle>{tool.summary}</RowSubtitle>
                    </RowBody>
                  </Row>
                ))}
              </List>
            </Stack>
          </Specimen>
        </div>
      </Group>

      <Group title="Unframed lists in a panel or sheet (List flush, boxed=&quot;end&quot;): flush rows start on the edge of the field or heading above them; boxed=&quot;end&quot; draws only the rule under the last row, so a list's own heading sits on its first row (What you're sending on an application)">
        <div className="kit-gallery__bounded">
          <Specimen label="flush + boxed, then flush + boxed=&quot;end&quot; under its heading: one rule between the groups">
            <Stack gap={4} style={{ maxWidth: 480 }}>
              <List aria-label="Prepared cover letter (flush specimen)" framed={false} flush boxed>
                <Row>
                  <RowBody>
                    <RowTitle>Prepared cover letter</RowTitle>
                    <RowSubtitle>I'm applying for the Backend Engineer role at Acme Robotics.</RowSubtitle>
                  </RowBody>
                </Row>
              </List>
              <Section headingLevel={4} size="sm" title="Screening answers" rule={false}>
                <List aria-label="Screening answers (boxed end specimen)" framed={false} flush boxed="end">
                  {['Why are you a good fit for this role?', 'What relevant experience do you bring?'].map((question) => (
                    <Row key={question}>
                      <RowBody>
                        <RowTitle>{question}</RowTitle>
                        <RowSubtitle>The scope of the role lines up with work I have already done.</RowSubtitle>
                      </RowBody>
                    </Row>
                  ))}
                </List>
              </Section>
            </Stack>
          </Specimen>
        </div>
      </Group>

      <Group title="Title only, with actions: on a narrow list a one-line row with no meta centres its title on the 44px actions; a fact that runs to several lines keeps them at its top, beside the title, never centred over the text (the Saved facts rows on /profile)">
        <div className="kit-gallery__bounded">
          <Specimen label="list in a 340px column">
            <div style={{ maxWidth: 340 }}>
              <List aria-label="Skills (narrow title-only specimen)">
                <Row>
                  <RowBody>
                    <RowTitle>Python</RowTitle>
                  </RowBody>
                  <RowActions reveal={false}>
                    <Button iconOnly variant="ghost" size="sm" aria-label="Edit Python">
                      <Pencil aria-hidden="true" />
                    </Button>
                    <Button iconOnly variant="ghost" size="sm" aria-label="Delete Python">
                      <Trash2 aria-hidden="true" />
                    </Button>
                  </RowActions>
                </Row>
                <Row data-specimen="multi-line-fact">
                  <RowBody>
                    <RowTitle>Senior Backend Engineer</RowTitle>
                    <RowSubtitle>
                      Northwind Labs. Led the migration of the dispatch APIs to FastAPI and cut p95 latency by 40% across
                      fourteen services.
                    </RowSubtitle>
                  </RowBody>
                  <RowActions reveal={false}>
                    <Button iconOnly variant="ghost" size="sm" aria-label="Edit Senior Backend Engineer">
                      <Pencil aria-hidden="true" />
                    </Button>
                    <Button iconOnly variant="ghost" size="sm" aria-label="Delete Senior Backend Engineer">
                      <Trash2 aria-hidden="true" />
                    </Button>
                  </RowActions>
                </Row>
              </List>
            </div>
          </Specimen>
        </div>
      </Group>

      <Group title="Actions below (RowActions placement=&quot;below&quot;): on a narrow list a labelled action drops under the text, so a long claim keeps the full width; wide lists keep it at the end">
        <div className="kit-gallery__bounded">
          <Specimen label="list in a 340px column">
            <div style={{ maxWidth: 340 }}>
              <List aria-label="Claims (below specimen)">
                <Row>
                  <RowBody>
                    <RowTitle>Tell me about a time you cut latency on a critical path.</RowTitle>
                    <RowSubtitle>I led the move from synchronous checkout calls to an event queue, cutting p95 latency by 38%…</RowSubtitle>
                  </RowBody>
                  <RowActions reveal={false} placement="below">
                    <Button type="button" size="sm" variant="secondary">
                      <Plus aria-hidden="true" />
                      Add to profile
                    </Button>
                  </RowActions>
                </Row>
              </List>
            </div>
          </Specimen>
        </div>
      </Group>

      <Group title="Meta below (RowMeta placement=&quot;below&quot;): on a narrow list a status Badge drops under the text, so a long question keeps the full width; wide lists keep it at the end">
        <div className="kit-gallery__bounded">
          <Specimen label="list in a 340px column">
            <div style={{ maxWidth: 340 }}>
              <List aria-label="Practice summary (meta below specimen)">
                <Row>
                  <RowBody>
                    <RowTitle>Walk me through how you would design a rate limiter for a public API.</RowTitle>
                    <RowSubtitle>2 attempts; 1 thing left to improve.</RowSubtitle>
                  </RowBody>
                  <RowMeta placement="below">
                    <Badge tone="mint">Improved</Badge>
                  </RowMeta>
                </Row>
                <Row>
                  <RowBody>
                    <RowTitle>Tell me about a time you disagreed with a technical decision.</RowTitle>
                  </RowBody>
                  <RowMeta placement="below">
                    <Badge tone="stone">Not practiced yet</Badge>
                  </RowMeta>
                </Row>
              </List>
            </div>
          </Specimen>
        </div>
      </Group>

      <Group title="A 320px phone (list under 20rem): a leading md ToolTile steps down to sm (28px), so the text keeps the room">
        <div className="kit-gallery__bounded">
          <Specimen label="list in a 288px column">
            <div style={{ maxWidth: 288 }}>
              <List aria-label="Runs (narrow tile specimen)">
                <Row>
                  <RowLeading>
                    <ToolTile size="md" tone="aqua" icon={FileText} />
                  </RowLeading>
                  <RowBody>
                    <RowTitle>Portfolio Roadmap (Staff Platform Engineer)</RowTitle>
                    <RowSubtitle>3 projects for Staff Platform Engineer</RowSubtitle>
                  </RowBody>
                  <RowMeta>2:13 PM</RowMeta>
                  <RowActions>
                    <Button type="button" size="sm" variant="ghost" iconOnly aria-label="More actions">
                      <MoreHorizontal aria-hidden="true" />
                    </Button>
                  </RowActions>
                </Row>
              </List>
            </div>
          </Specimen>
        </div>
      </Group>

      <Group title="A rail of recent runs (Row overflow=&quot;clamp&quot;, RowTitle aside, RowSubtitle lines={2}): a run with no subject is titled by when it ran (never the tool's name), the score pill sits on the title's line, and the headline gets the rail's full width for two lines">
        <div className="kit-gallery__bounded">
          <Specimen label="list in a 280px rail">
            <div style={{ maxWidth: 280 }}>
              <List aria-label="Recent runs (rail specimen)">
                {[
                  { id: 'a', title: 'Oct 6, 2:13 PM', date: null, headline: 'Strong foundation: 2 bullets carry real numbers; only light polish is left.', score: '89/100' },
                  { id: 'b', title: 'Senior Platform Engineer at Northwind Labs', date: 'Oct 6', headline: 'You match 3 of 6 requirements for Senior Platform Engineer.', score: '67%' },
                ].map((run) => (
                  <Row key={run.id} overflow="clamp">
                    <RowBody>
                      <RowTitle
                        aside={
                          <Badge tone="tangerine" score aria-hidden="true">
                            {run.score}
                          </Badge>
                        }
                      >
                        {run.title}
                      </RowTitle>
                      {run.date ? <RowSubtitle>{run.date}</RowSubtitle> : null}
                      <RowSubtitle lines={2}>{run.headline}</RowSubtitle>
                    </RowBody>
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

        <Specimen label="RowTitle weight: bold (a name), semibold (a strength), regular (a sentence or a quote)">
          <List aria-label="Title weights">
            <Row>
              <RowBody>
                <RowTitle>Senior Backend Engineer</RowTitle>
              </RowBody>
            </Row>
            <Row>
              <RowBody>
                <RowTitle size="lg" weight="semibold">
                  Covers a clear, readable set of core sections.
                </RowTitle>
              </RowBody>
            </Row>
            <Row>
              <RowBody>
                <RowTitle weight="regular">
                  Open with the dispatch latency win: it is the one result the posting asks about by name, and it is
                  measurable.
                </RowTitle>
              </RowBody>
            </Row>
          </List>
        </Specimen>

        <Specimen label="What next row: flat lg ToolTile, display title, RowSubtitle size=&quot;lg&quot; (15px)">
          <List aria-label="What next (specimen)">
            <Row>
              <RowLeading>
                <ToolTile tone={tools['job-match'].tone} icon={tools['job-match'].icon} size="lg" flat />
              </RowLeading>
              <RowBody>
                <RowTitle size="lg">Match this resume to a job</RowTitle>
                <RowSubtitle size="lg">Paste one job posting and see where you fit and where you don't.</RowSubtitle>
              </RowBody>
              <RowMeta>
                <Button variant="secondary" size="sm">
                  Open Job Match
                </Button>
              </RowMeta>
            </Row>
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

import { useState } from 'react'
import { Search, SlidersHorizontal, Star } from 'lucide-react'
import { Badge, Button, Checkbox, Count, Field, Input, Segmented, Select, Switch, Textarea } from '#/components/kit'
import { GallerySection, Group, Row } from './gallery-parts'

const TOOLS = [
  { value: 'resume', label: 'Resume' },
  { value: 'job-match', label: 'Match' },
  { value: 'career', label: 'Career' },
  { value: 'cover-letter', label: 'Letter' },
  { value: 'interview', label: 'Interview' },
  { value: 'portfolio', label: 'Portfolio' },
]

function DiscoveryToolbar() {
  const [query, setQuery] = useState('')
  return (
    <div className="kit-gallery__toolbar">
      <Input
        type="search"
        aria-label="Search jobs"
        placeholder="Title, company or skill"
        leading={<Search aria-hidden="true" />}
        clearable
        value={query}
        onChange={(event) => setQuery(event.target.value)}
      />
      <Input aria-label="Location" placeholder="Location" className="kit-gallery__narrow" />
      <Select aria-label="Company" defaultValue="" className="kit-gallery__narrow">
        <option value="">All companies</option>
        <option value="Northwind Labs">Northwind Labs</option>
      </Select>
      <Select aria-label="Posted" defaultValue="" className="kit-gallery__narrow">
        <option value="">Any time</option>
        <option value="7">Past week</option>
      </Select>
      <Checkbox framed label="Remote only" />
      <Select leading="Sort" aria-label="Sort" defaultValue="best_match" className="kit-gallery__narrow">
        <option value="best_match">Best skills fit</option>
        <option value="newest">Newest</option>
      </Select>
      <Button variant="secondary">
        <SlidersHorizontal aria-hidden="true" />
        Filters
        <Count value={2} />
      </Button>
    </div>
  )
}

function HistoryToolbar() {
  const [tool, setTool] = useState<string | null>('resume')
  const [favorites, setFavorites] = useState(false)
  return (
    <div className="kit-gallery__toolbar">
      <Input
        type="search"
        aria-label="Search by saved label"
        placeholder="Search by saved label"
        leading={<Search aria-hidden="true" />}
        clearable
        className="kit-gallery__narrow"
      />
      <Segmented aria-label="Filter by tool" deselectable options={TOOLS} value={tool} onValueChange={setTool} />
      <Button variant="secondary" aria-pressed={favorites} onClick={() => setFavorites((value) => !value)}>
        <Star aria-hidden="true" fill={favorites ? 'currentColor' : 'none'} />
        Favorites
      </Button>
      <Button variant="link" size="sm" onClick={() => setTool(null)}>
        Clear filters
      </Button>
    </div>
  )
}

function ProfileForm() {
  const [submitted, setSubmitted] = useState(false)
  const [email, setEmail] = useState('ada@')
  const invalid = submitted && !email.includes('.')
  return (
    <form
      className="kit-gallery__form"
      noValidate
      onSubmit={(event) => {
        event.preventDefault()
        setSubmitted(true)
      }}
    >
      <Field label="Full name" required>
        <Input defaultValue="Ada Lovelace" autoComplete="name" />
      </Field>
      <Field label="Email" required error={invalid ? 'Enter an email address like name@example.com.' : undefined}>
        <Input type="email" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="email" />
      </Field>
      <Field label="Target role" optional help="Used to rank jobs in Discover.">
        <Select defaultValue="">
          <option value="">No preference</option>
          <option value="backend">Backend engineer</option>
          <option value="manager">Engineering manager</option>
        </Select>
      </Field>
      <Field label="Short bio" optional>
        <Textarea autosize placeholder="Two sentences about what you do." />
      </Field>
      <Switch controlPosition="end" label="Weekly job digest" description="One email, Mondays." defaultChecked />
      <div className="kit-gallery__actions">
        <Button type="submit">Save profile</Button>
        <Button type="button" variant="ghost">
          Cancel
        </Button>
      </div>
    </form>
  )
}

export function CompositionSection() {
  return (
    <GallerySection
      id="composition"
      title="Composition"
      note="Mixed controls on one row: same height, border, radius and focus ring. Check these at 375 as well: every control is 44 tall on touch."
    >
      <Group title="Discover toolbar">
        <DiscoveryToolbar />
      </Group>
      <Group title="History toolbar">
        <HistoryToolbar />
      </Group>
      <Group title="Form (press Save to see validation)">
        <ProfileForm />
      </Group>
      <Group title="Status in context">
        <Row>
          <Badge tone="success" dot>
            Offer
          </Badge>
          <Badge tone="warning" dot>
            Needs review
          </Badge>
          <Button size="sm" variant="secondary">
            View
          </Button>
        </Row>
      </Group>
    </GallerySection>
  )
}

import { useState } from 'react'
import { Search, Star } from 'lucide-react'
import { Button, Checkbox, Input, Pagination, Segmented, Select, Toolbar } from '#/components/kit'
import { GallerySection, Group, Specimen } from './gallery-parts'

const TOOLS = [
  { value: 'resume', label: 'Resume' },
  { value: 'job-match', label: 'Match' },
  { value: 'career', label: 'Career' },
  { value: 'cover-letter', label: 'Letter' },
  { value: 'interview', label: 'Interview' },
  { value: 'portfolio', label: 'Portfolio' },
]

function DiscoverToolbar() {
  const [query, setQuery] = useState('')
  const [company, setCompany] = useState('')
  const [posted, setPosted] = useState('')
  const [remote, setRemote] = useState(false)
  const [sort, setSort] = useState('best_match')
  const active = [company, posted, remote ? 'remote' : ''].filter(Boolean).length
  const clear = () => {
    setCompany('')
    setPosted('')
    setRemote(false)
  }
  return (
    <Toolbar
      search={
        <Input
          type="search"
          aria-label="Search jobs"
          placeholder="Title, company or skill"
          leading={<Search aria-hidden="true" />}
          clearable
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
      }
      filters={
        <>
          <Select aria-label="Company" value={company} onChange={(event) => setCompany(event.target.value)}>
            <option value="">All companies</option>
            <option value="Northwind Labs">Northwind Labs</option>
            <option value="Fernhill Systems">Fernhill Systems</option>
          </Select>
          <Select aria-label="Posted" value={posted} onChange={(event) => setPosted(event.target.value)}>
            <option value="">Any time</option>
            <option value="7">Past week</option>
            <option value="30">Past month</option>
          </Select>
          <Checkbox framed label="Remote only" checked={remote} onCheckedChange={setRemote} />
        </>
      }
      sort={
        <Select leading="Sort" aria-label="Sort" value={sort} onChange={(event) => setSort(event.target.value)}>
          <option value="best_match">Best skills fit</option>
          <option value="newest">Newest</option>
        </Select>
      }
      count={query ? '3 jobs' : '148 jobs'}
      countPlacement="below"
      activeFilters={active}
      onClearFilters={clear}
    />
  )
}

function HistoryToolbar() {
  const [tool, setTool] = useState<string | null>('resume')
  const [favorites, setFavorites] = useState(false)
  return (
    <Toolbar
      search={<Input type="search" aria-label="Search by saved label" placeholder="Search by saved label" leading={<Search aria-hidden="true" />} clearable />}
      filters={
        <>
          <Segmented aria-label="Filter by tool" deselectable options={TOOLS} value={tool} onValueChange={setTool} />
          <Button variant="secondary" aria-pressed={favorites} onClick={() => setFavorites((value) => !value)}>
            <Star aria-hidden="true" fill={favorites ? 'currentColor' : 'none'} />
            Favorites
          </Button>
        </>
      }
      activeFilters={(tool ? 1 : 0) + (favorites ? 1 : 0)}
      onClearFilters={() => {
        setTool(null)
        setFavorites(false)
      }}
      count="24 runs"
    />
  )
}

function Pages() {
  const [page, setPage] = useState(1)
  const [late, setLate] = useState(14)
  const [last, setLast] = useState(20)
  return (
    <div className="kit-gallery__grid kit-gallery__grid--wide">
      <Specimen label="numbered, first page">
        <Pagination page={page} pageCount={20} onPageChange={setPage} />
      </Specimen>
      <Specimen label="numbered, middle (gaps both sides)">
        <Pagination page={late} pageCount={40} onPageChange={setLate} />
      </Specimen>
      <Specimen label="numbered, last page">
        <Pagination page={last} pageCount={20} onPageChange={setLast} />
      </Specimen>
      <Specimen label="numbered, 3 pages">
        <Pagination page={2} pageCount={3} onPageChange={() => undefined} />
      </Specimen>
      <Specimen label="simple with a summary (History, admin)">
        <Pagination variant="simple" page={2} pageCount={9} onPageChange={() => undefined} summary="Showing 21 to 40 of 134" />
      </Specimen>
      <Specimen label="one page renders nothing (nothing between the brackets)">
        <p className="kit-gallery__paragraph">
          [<Pagination page={1} pageCount={1} onPageChange={() => undefined} />]
        </p>
      </Specimen>
      <Specimen label="right to left">
        <div dir="rtl">
          <Pagination page={3} pageCount={9} onPageChange={() => undefined} />
        </div>
      </Specimen>
    </div>
  )
}

export function ToolbarSection() {
  return (
    <GallerySection
      id="toolbar"
      title="Toolbar, Pagination"
      note="At 767px and below the filters and sort move into a bottom sheet behind one Filters button that shows how many are active. The controls are the same ones, controlled by the page."
    >
      <Group title="Discover toolbar, count below (try the filters, then clear them)">
        <DiscoverToolbar />
      </Group>
      <Group title="History toolbar (a Segmented and a toggle as filters)">
        <HistoryToolbar />
      </Group>
      <Group title="Search only">
        <Toolbar
          search={<Input type="search" aria-label="Search users" placeholder="Search by email" leading={<Search aria-hidden="true" />} clearable />}
          count="34 users"
        />
      </Group>
      <Group title="Pagination">
        <Pages />
      </Group>
    </GallerySection>
  )
}

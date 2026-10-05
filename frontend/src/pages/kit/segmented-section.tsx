import { useState } from 'react'
import { LayoutGrid, List, Star } from 'lucide-react'
import { Button, Field, Segmented, type SegmentedOption } from '#/components/kit'
import { GallerySection, Group, Grid, Row, Specimen } from './gallery-parts'

const TONES = [
  { value: 'professional', label: 'Professional' },
  { value: 'warm', label: 'Warm' },
  { value: 'direct', label: 'Direct' },
] satisfies SegmentedOption<string>[]

const TOOLS = [
  { value: 'resume', label: 'Resume' },
  { value: 'job-match', label: 'Match' },
  { value: 'career', label: 'Career' },
  { value: 'cover-letter', label: 'Letter' },
  { value: 'interview', label: 'Interview' },
  { value: 'portfolio', label: 'Portfolio' },
] satisfies SegmentedOption<string>[]

function ToneDemo({ size }: { size?: 'sm' | 'md' }) {
  const [tone, setTone] = useState('warm')
  return <Segmented aria-label="Tone" size={size} options={TONES} value={tone} onValueChange={setTone} />
}

function HistoryFilterDemo() {
  const [tool, setTool] = useState<string | null>(null)
  const [favorites, setFavorites] = useState(false)
  return (
    <Row>
      <Segmented aria-label="Filter by tool" deselectable options={TOOLS} value={tool} onValueChange={setTool} />
      <Button variant="secondary" aria-pressed={favorites} onClick={() => setFavorites((value) => !value)}>
        <Star aria-hidden="true" fill={favorites ? 'currentColor' : 'none'} />
        Favorites
      </Button>
    </Row>
  )
}

function ViewDemo() {
  const [view, setView] = useState('board')
  return (
    <Segmented
      aria-label="View"
      size="sm"
      value={view}
      onValueChange={setView}
      options={[
        { value: 'board', label: 'Board', icon: <LayoutGrid aria-hidden="true" /> },
        { value: 'list', label: 'List', icon: <List aria-hidden="true" /> },
      ]}
    />
  )
}

function CountDemo() {
  const [count, setCount] = useState(10)
  return (
    <Segmented
      aria-label="Question count"
      options={[
        { value: 5, label: '5', 'aria-label': '5 questions' },
        { value: 10, label: '10', 'aria-label': '10 questions' },
        { value: 15, label: '15', 'aria-label': '15 questions' },
      ]}
      value={count}
      onValueChange={setCount}
    />
  )
}

export function SegmentedSection() {
  const [order, setOrder] = useState('weakest')
  return (
    <GallerySection
      id="segmented"
      title="Segmented"
      note="Single-select radiogroup: arrow keys move and select, Home and End jump, Tab enters on the selected option. Wider than its container, it scrolls sideways."
    >
      <Group title="Sizes">
        <Grid>
          <Specimen label="md (44)">
            <ToneDemo />
          </Specimen>
          <Specimen label="sm (36)">
            <ToneDemo size="sm" />
          </Specimen>
          <Specimen label="numbers">
            <CountDemo />
          </Specimen>
          <Specimen label="icons + labels (sm)">
            <ViewDemo />
          </Specimen>
        </Grid>
      </Group>

      <Group title="States">
        <Grid>
          <Specimen label="nothing selected">
            <Segmented aria-label="No selection" options={TONES} />
          </Specimen>
          <Specimen label="one option disabled">
            <Segmented
              aria-label="One disabled"
              defaultValue="professional"
              options={[
                { value: 'professional', label: 'Professional' },
                { value: 'warm', label: 'Warm', disabled: true },
                { value: 'direct', label: 'Direct' },
              ]}
            />
          </Specimen>
          <Specimen label="group disabled">
            <Segmented aria-label="Disabled group" disabled defaultValue="warm" options={TONES} />
          </Specimen>
          <Specimen label="icon-only options (aria-label required)">
            <Segmented
              aria-label="Layout"
              size="sm"
              defaultValue="grid"
              options={[
                { value: 'grid', icon: <LayoutGrid aria-hidden="true" />, 'aria-label': 'Grid' },
                { value: 'list', icon: <List aria-hidden="true" />, 'aria-label': 'List' },
              ]}
            />
          </Specimen>
          <Specimen label="in a Field (label names the group)">
            <Field label="Question order">
              <Segmented
                value={order}
                onValueChange={setOrder}
                options={[
                  { value: 'weakest', label: 'Weakest first' },
                  { value: 'original', label: 'As asked' },
                ]}
              />
            </Field>
          </Specimen>
          <Specimen label="in a Field with help and an error (aria-describedby and aria-invalid are wired)">
            <Field label="Tone" help="Pick one." error="Choose a tone to continue." required>
              <Segmented options={TONES} data-testid="segmented-in-field" />
            </Field>
          </Specimen>
          <Specimen label="fullWidth">
            <Segmented aria-label="Full width" fullWidth defaultValue="direct" options={TONES} />
          </Specimen>
        </Grid>
      </Group>

      <Group title="Deselectable filter plus a toggle button (History)">
        <HistoryFilterDemo />
        <Specimen label="inside a 20rem container: scrolls instead of wrapping">
          <div className="kit-gallery__row kit-gallery__bounded">
            <Segmented aria-label="Narrow filter" deselectable options={TOOLS} defaultValue="career" />
          </div>
        </Specimen>
      </Group>
    </GallerySection>
  )
}

import { useState } from 'react'
import { Badge, Checkbox, Field, Input, RadioGroup, RadioItem, Select, Switch } from '#/components/kit'
import { GallerySection, Group, Grid, Specimen } from './gallery-parts'

function SelectAllDemo() {
  const [items, setItems] = useState([true, false, true])
  const checked = items.filter(Boolean).length
  return (
    <div className="kit-gallery__specimen">
      <Checkbox
        label="Select all"
        checked={checked === items.length}
        indeterminate={checked > 0 && checked < items.length}
        onCheckedChange={(next) => setItems(items.map(() => next))}
      />
      {['Resume', 'Cover letter', 'Portfolio'].map((name, index) => (
        <Checkbox
          key={name}
          label={name}
          checked={items[index]}
          onCheckedChange={(next) => setItems(items.map((value, i) => (i === index ? next : value)))}
        />
      ))}
    </div>
  )
}

function SwitchDemo() {
  const [on, setOn] = useState(true)
  return <Switch label="ATS-friendly mode" checked={on} onCheckedChange={setOn} />
}

const TEMPLATES = [
  { id: 'classic', name: 'Classic', description: 'One column, serif headings. Every applicant tracking system reads it.', safe: true },
  { id: 'modern', name: 'Modern', description: 'Two columns with a skills sidebar. Best for people applications.', safe: false },
  { id: 'compact', name: 'Compact', description: 'Dense single column that fits a long career on two pages.', safe: true },
]

const FONTS = [
  { id: 'inter', name: 'Inter', category: 'sans serif', family: 'var(--font-ui)' },
  // A CV document font choice, not the app's face (the app no longer loads Newsreader): a generic serif sample.
  { id: 'newsreader', name: 'Newsreader', category: 'serif', family: "Georgia, 'Times New Roman', serif" },
  { id: 'mono', name: 'Plex Mono', category: 'monospace', family: 'var(--font-mono)' },
]

const ACCENTS = [
  { value: 'var(--tangerine)', name: 'Tangerine' },
  { value: 'var(--mint)', name: 'Mint' },
  { value: 'var(--ink)', name: 'Ink' },
  { value: 'var(--lilac)', name: 'Lilac' },
  { value: 'var(--ink-3)', name: 'Slate' },
  { value: 'var(--surface)', name: 'Paper (white)' },
]

function TemplateDemo() {
  const [value, setValue] = useState('classic')
  return (
    <RadioGroup aria-label="Template" variant="card" value={value} onValueChange={setValue}>
      {TEMPLATES.map((template) => (
        <RadioItem
          key={template.id}
          value={template.id}
          label={
            <>
              {template.name}{' '}
              <Badge size="sm" tone={template.safe ? 'success' : 'neutral'}>
                {template.safe ? 'ATS-safe' : 'Two columns'}
              </Badge>
            </>
          }
          description={template.description}
        />
      ))}
    </RadioGroup>
  )
}

function FontDemo() {
  const [value, setValue] = useState('newsreader')
  return (
    <RadioGroup aria-label="Font" variant="card" value={value} onValueChange={setValue}>
      {FONTS.map((font) => (
        <RadioItem
          key={font.id}
          value={font.id}
          label={<span style={{ fontFamily: font.family }}>{font.name}</span>}
          meta={font.category}
        />
      ))}
    </RadioGroup>
  )
}

function SwatchDemo() {
  const [value, setValue] = useState('var(--tangerine)')
  return (
    <RadioGroup aria-label="Accent colour" variant="swatch" value={value} onValueChange={setValue}>
      {ACCENTS.map((accent) => (
        <RadioItem key={accent.value} value={accent.value} label={accent.name} swatch={accent.value} />
      ))}
    </RadioGroup>
  )
}

function PlainDemo() {
  const [value, setValue] = useState('review')
  return (
    <RadioGroup aria-label="After tailoring" value={value} onValueChange={setValue}>
      <RadioItem value="review" label="Review each change" description="Nothing is applied until you accept it." />
      <RadioItem value="apply" label="Apply everything" description="You can still undo it from the version list." />
      <RadioItem value="skip" label="Skip" />
    </RadioGroup>
  )
}

export function ChoiceSection() {
  return (
    <GallerySection
      id="choice"
      title="Checkbox, Switch, RadioGroup"
      note="Native checkbox and radio inputs, restyled. The whole label row is the hit area. Checked is tangerine with an ink tick; a switch is mint when on and applies immediately; a checkbox waits for a submit."
    >
      <Group title="Checkbox">
        <Grid>
          <Specimen label="unchecked">
            <Checkbox label="Remember me" />
          </Specimen>
          <Specimen label="checked">
            <Checkbox label="Remember me" defaultChecked />
          </Specimen>
          <Specimen label="indeterminate / select all (interactive)">
            <SelectAllDemo />
          </Specimen>
          <Specimen label="with description">
            <Checkbox label="Email me about new matches" description="At most one email a week. You can turn this off at any time." />
          </Specimen>
          <Specimen label="invalid">
            <Checkbox label="I accept the terms of service" invalid />
          </Specimen>
          <Specimen label="disabled">
            <div className="kit-gallery__specimen">
              <Checkbox label="Disabled, unchecked" disabled />
              <Checkbox label="Disabled, checked" disabled defaultChecked />
            </div>
          </Specimen>
          <Specimen label="long label wraps">
            <Checkbox label="Use my confirmed profile facts and the job description to draft every section of the tailored CV" />
          </Specimen>
          <Specimen label="framed (toolbar)">
            <Checkbox framed label="Remote only" />
          </Specimen>
          <Specimen label="framed, checked">
            <Checkbox framed label="Remote only" defaultChecked />
          </Specimen>
          <Specimen label="framed sm / md / lg, each beside an Input of the same size">
            <div className="kit-gallery__specimen">
              {(['sm', 'md', 'lg'] as const).map((size) => (
                <div key={size} className="kit-gallery__toolbar">
                  <Checkbox framed size={size} label={`Remote only (${size})`} />
                  <Input size={size} aria-label={`Filter (${size})`} placeholder={`Filter (${size})`} className="kit-gallery__narrow" />
                  <Select size={size} aria-label={`Level (${size})`} className="kit-gallery__narrow" defaultValue="">
                    <option value="">Level</option>
                    <option value="senior">Senior</option>
                  </Select>
                </div>
              ))}
            </div>
          </Specimen>
        </Grid>
      </Group>

      <Group title="Switch (role=switch)">
        <Grid>
          <Specimen label="off">
            <Switch label="Weekly digest" />
          </Specimen>
          <Specimen label="on (interactive)">
            <SwitchDemo />
          </Specimen>
          <Specimen label="with description">
            <Switch
              label="ATS-friendly mode"
              description="Uses a plain one-column layout and a standard font so application systems read every line."
              defaultChecked
            />
          </Specimen>
          <Specimen label="control at the end (settings row)">
            <Switch
              controlPosition="end"
              label="Product updates"
              description="Occasional notes about new tools."
            />
          </Specimen>
          <Specimen label="disabled">
            <div className="kit-gallery__specimen">
              <Switch label="Disabled, off" disabled />
              <Switch label="Disabled, on" disabled defaultChecked />
            </div>
          </Specimen>
          <Specimen label="invalid">
            <Switch label="Share my profile" invalid />
          </Specimen>
          <Specimen label="framed (toolbar)">
            <Switch framed label="Include remote" />
          </Specimen>
          <Specimen label="framed sm, beside a small Input">
            <div className="kit-gallery__toolbar">
              <Switch framed size="sm" label="Include remote" />
              <Input size="sm" aria-label="Filter (switch row)" placeholder="Filter" className="kit-gallery__narrow" />
            </div>
          </Specimen>
          <Specimen label="no visible label (aria-label)">
            <Switch aria-label="Enable alerts" />
          </Specimen>
        </Grid>
      </Group>

      <Group title="RadioGroup (native radios; arrow keys move and select)">
        <Grid>
          <Specimen label="plain, with descriptions (interactive)">
            <PlainDemo />
          </Specimen>
          <Specimen label="plain, horizontal">
            <RadioGroup aria-label="Spacing" orientation="horizontal" defaultValue="normal">
              <RadioItem value="tight" label="Tight" />
              <RadioItem value="normal" label="Normal" />
              <RadioItem value="loose" label="Loose" />
            </RadioGroup>
          </Specimen>
          <Specimen label="framed, horizontal (Input frame)">
            <RadioGroup aria-label="Remote" variant="framed" orientation="horizontal" defaultValue="any">
              <RadioItem value="any" label="Any" />
              <RadioItem value="remote" label="Remote" />
              <RadioItem value="onsite" label="On site" />
            </RadioGroup>
          </Specimen>
          <Specimen label="in a Field, with help and an error">
            <Field label="Visibility" help="Who can see this profile." error="Choose one to continue.">
              <RadioGroup aria-label="Visibility">
                <RadioItem value="private" label="Only me" />
                <RadioItem value="link" label="Anyone with the link" />
              </RadioGroup>
            </Field>
          </Specimen>
          <Specimen label="disabled group (one selected)">
            <RadioGroup aria-label="Locked" disabled defaultValue="a">
              <RadioItem value="a" label="Selected, disabled" />
              <RadioItem value="b" label="Unselected, disabled" />
            </RadioGroup>
          </Specimen>
          <Specimen label="one option disabled">
            <RadioGroup aria-label="Plan" defaultValue="a">
              <RadioItem value="a" label="Available" />
              <RadioItem value="b" label="Not available yet" disabled />
            </RadioGroup>
          </Specimen>
        </Grid>
      </Group>

      <Group title="Cards: template and font pickers (a long description wraps; meta sits at the end)">
        <Grid wide>
          <Specimen label="card with Badge in the label (interactive)">
            <TemplateDemo />
          </Specimen>
          <Specimen label="card with meta (interactive)">
            <FontDemo />
          </Specimen>
        </Grid>
      </Group>

      <Group title="Swatches: ring plus position, not colour alone (the near-white one still reads)">
        <Grid>
          <Specimen label="accent colour (interactive)">
            <SwatchDemo />
          </Specimen>
          <Specimen label="disabled">
            <RadioGroup aria-label="Locked accent" variant="swatch" disabled defaultValue="var(--tangerine)">
              {ACCENTS.slice(0, 3).map((accent) => (
                <RadioItem key={accent.value} value={accent.value} label={accent.name} swatch={accent.value} />
              ))}
            </RadioGroup>
          </Specimen>
        </Grid>
      </Group>
    </GallerySection>
  )
}

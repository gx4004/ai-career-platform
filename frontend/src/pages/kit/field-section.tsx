import { useState } from 'react'
import { AtSign, Eye, EyeOff, Search, Upload } from 'lucide-react'
import { Button, DateField, Field, FileInput, Input, Select, Textarea } from '#/components/kit'
import { GallerySection, Group, Grid, Specimen } from './gallery-parts'

function SearchDemo() {
  const [value, setValue] = useState('backend')
  return (
    <Input
      type="search"
      aria-label="Search jobs"
      placeholder="Title, company or skill"
      leading={<Search aria-hidden="true" />}
      clearable
      value={value}
      onChange={(event) => setValue(event.target.value)}
    />
  )
}

function PasswordDemo() {
  const [shown, setShown] = useState(false)
  return (
    <Field label="Password">
      <Input
        type={shown ? 'text' : 'password'}
        defaultValue="correct horse"
        autoComplete="off"
        trailing={
          <Button
            iconOnly
            size="sm"
            variant="ghost"
            aria-label={shown ? 'Hide password' : 'Show password'}
            aria-pressed={shown}
            onClick={() => setShown((value) => !value)}
          >
            {shown ? <EyeOff aria-hidden="true" /> : <Eye aria-hidden="true" />}
          </Button>
        }
      />
    </Field>
  )
}

function AutosizeDemo() {
  const [value, setValue] = useState('Led the migration of the billing service to event-driven processing.')
  return <Textarea aria-label="Bullet" autosize value={value} onChange={(event) => setValue(event.target.value)} />
}

function DateDemo() {
  const [value, setValue] = useState('2026-10-31')
  return <DateField aria-label="Due date" value={value} onValueChange={setValue} />
}

const COMPANIES = ['All companies', 'Northwind Labs', 'Brightline', 'Quarry', 'Harbor Health']

export function FieldSection() {
  return (
    <GallerySection
      id="field"
      title="Field, Input, Select, Textarea, DateField"
      note="Field wires id, aria-describedby, aria-invalid, required and disabled into the control it wraps. Every frame shares one height scale (36, 44, 56), a 2px ink outline, radius 12 and no shadow; state is a fill (hover stone, focus warm white, invalid rose, disabled stone). The outline and the focus ring are always ink: an error is the rose fill plus its message."
    >
      <Group title="Field">
        <Grid>
          <Specimen label="label">
            <Field label="Full name">
              <Input placeholder="Ada Lovelace" />
            </Field>
          </Specimen>
          <Specimen label="optional + help">
            <Field label="Phone" optional help="Shown on your CV if you include it.">
              <Input type="tel" placeholder="+49 30 1234567" />
            </Field>
          </Specimen>
          <Specimen label="long help: the last line is balanced, never one orphan word">
            <Field
              label="Job description"
              optional
              help="Paste the posting so the fit, the tailored CV and the letter use it, and so we can check your documents against it."
            >
              <Textarea rows={3} />
            </Field>
          </Specimen>
          <Specimen label="required">
            <Field label="Email" required>
              <Input type="email" placeholder="you@example.com" />
            </Field>
          </Specimen>
          <Specimen label="error">
            <Field label="Email" error="Enter an email address like name@example.com.">
              <Input type="email" defaultValue="ada@" />
            </Field>
          </Specimen>
          <Specimen label="help + error">
            <Field label="Password" help="At least 8 characters." error="Too short: 5 of 8 characters.">
              <Input type="password" defaultValue="hello" />
            </Field>
          </Specimen>
          <Specimen label="disabled">
            <Field label="Account email" help="Change it from account settings." disabled>
              <Input defaultValue="demo@example.com" />
            </Field>
          </Specimen>
          <Specimen label="group: one label over controls that name themselves (a list of highlights)">
            <Field group label="Highlights" help="One result per line.">
              <Textarea aria-label="Highlight 1" rows={1} defaultValue="Cut onboarding time by 30%." />
              <Textarea aria-label="Highlight 2" rows={1} defaultValue="Led the platform move to Postgres 15." />
            </Field>
          </Specimen>
          <Specimen label="visually hidden label">
            <Field label="Search jobs" hideLabel>
              <Input placeholder="Label is read, not shown" leading={<Search aria-hidden="true" />} />
            </Field>
          </Specimen>
        </Grid>
      </Group>

      <Group title="Input sizes">
        <Grid>
          <Specimen label="sm (36)">
            <Input size="sm" aria-label="Small" placeholder="Small" />
          </Specimen>
          <Specimen label="md (44, default)">
            <Input aria-label="Medium" placeholder="Medium" />
          </Specimen>
          <Specimen label="lg (56)">
            <Input size="lg" aria-label="Large" placeholder="Large" />
          </Specimen>
        </Grid>
      </Group>

      <Group title="Input states">
        <Grid>
          <Specimen label="default, empty">
            <Input aria-label="Empty" placeholder="Placeholder text" />
          </Specimen>
          <Specimen label="filled">
            <Input aria-label="Filled" defaultValue="Senior Backend Engineer" />
          </Specimen>
          <Specimen label="focus (forced): warm fill and 3px ink ring">
            <Input aria-label="Focus" className="kit-demo-focus" defaultValue="Focused" />
          </Specimen>
          <Specimen label="invalid">
            <Input aria-label="Invalid" invalid defaultValue="not-an-email" />
          </Specimen>
          <Specimen label="invalid and focused: the ring stays 3px ink, the rose fill stays">
            <Input aria-label="Invalid focus" invalid className="kit-demo-focus" defaultValue="not-an-email" />
          </Specimen>
          <Specimen label="read-only">
            <Input aria-label="Read-only" readOnly defaultValue="Locked by your account" />
          </Specimen>
          <Specimen label="disabled">
            <Input aria-label="Disabled" disabled defaultValue="Unavailable" />
          </Specimen>
          <Specimen label="disabled, empty">
            <Input aria-label="Disabled empty" disabled placeholder="Unavailable" />
          </Specimen>
          <Specimen label="long value (truncates)">
            <Input aria-label="Long" defaultValue="Principal Staff Software Engineer, Distributed Systems and Data Platform Infrastructure" />
          </Specimen>
        </Grid>
      </Group>

      <Group title="Adornments and clear">
        <Grid>
          <Specimen label="search + clear (type to see ×)">
            <SearchDemo />
          </Specimen>
          <Specimen label="leading icon">
            <Input aria-label="Handle" leading={<AtSign aria-hidden="true" />} placeholder="handle" />
          </Specimen>
          <Specimen label="leading text">
            <Input aria-label="Website" leading="https://" placeholder="example.com" />
          </Specimen>
          <Specimen label="trailing text">
            <Input aria-label="Salary" inputMode="numeric" defaultValue="85000" trailing="EUR / year" />
          </Specimen>
          <Specimen label="sm with icon">
            <Input size="sm" aria-label="Filter" leading={<Search aria-hidden="true" />} placeholder="Filter" />
          </Specimen>
          <Specimen label="trailing icon button (show or hide a password): ghost, iconOnly, size sm, inset like the clear button">
            <PasswordDemo />
          </Specimen>
        </Grid>
      </Group>

      <Group title="Select">
        <Grid>
          <Specimen label="sm / md / lg">
            <div className="kit-gallery__specimen">
              <Select size="sm" aria-label="Company small" defaultValue="">
                {COMPANIES.map((c, i) => (
                  <option key={c} value={i === 0 ? '' : c}>
                    {c}
                  </option>
                ))}
              </Select>
              <Select aria-label="Company medium" defaultValue="Brightline">
                {COMPANIES.map((c, i) => (
                  <option key={c} value={i === 0 ? '' : c}>
                    {c}
                  </option>
                ))}
              </Select>
              <Select size="lg" aria-label="Company large" defaultValue="">
                {COMPANIES.map((c, i) => (
                  <option key={c} value={i === 0 ? '' : c}>
                    {c}
                  </option>
                ))}
              </Select>
            </div>
          </Specimen>
          <Specimen label="leading label">
            <Select leading="Sort" aria-label="Sort" defaultValue="best_match">
              <option value="best_match">Best skills fit</option>
              <option value="newest">Newest</option>
            </Select>
          </Specimen>
          <Specimen label="in a Field, with error">
            <Field label="Stage" error="Pick a stage to continue.">
              <Select defaultValue="">
                <option value="" disabled>
                  Choose a stage
                </option>
                <option value="saved">Saved</option>
                <option value="applied">Applied</option>
              </Select>
            </Field>
          </Specimen>
          <Specimen label="invalid">
            <Select invalid aria-label="Invalid select" defaultValue="">
              <option value="">Choose</option>
            </Select>
          </Specimen>
          <Specimen label="disabled">
            <Select disabled aria-label="Disabled select" defaultValue="saved">
              <option value="saved">Saved</option>
            </Select>
          </Specimen>
          <Specimen label="long option (truncates)">
            <Select aria-label="Long option" defaultValue="long">
              <option value="long">Principal Staff Software Engineer, Distributed Systems and Data Platform</option>
            </Select>
          </Specimen>
        </Grid>
      </Group>

      <Group title="Textarea">
        <Grid>
          <Specimen label="default (3 rows)">
            <Textarea aria-label="Notes" placeholder="Notes about this application" />
          </Specimen>
          <Specimen label="filled">
            <Textarea
              aria-label="Cover note"
              defaultValue={'Dear hiring team,\nI have spent six years building payment platforms and would like to bring that to Northwind Labs.'}
            />
          </Specimen>
          <Specimen label="autosize (type new lines)">
            <AutosizeDemo />
          </Specimen>
          <Specimen label="autosize, maxRows 3: the box ends on a line boundary, no half line shows under the third">
            <Textarea
              aria-label="Capped"
              autosize
              maxRows={3}
              defaultValue={'one\ntwo\nthree\nfour\nfive\nsix'}
            />
          </Specimen>
          <Specimen label="prose (autosize): reading-length text at 17/1.6, as the cover letter's paragraphs">
            <Textarea
              aria-label="Letter paragraph"
              autosize
              prose
              rows={1}
              defaultValue="I have spent six years building payment platforms, most recently cutting p95 checkout latency by 38% at Brightline, and I would like to bring that to Northwind Labs."
            />
          </Specimen>
          <Specimen label="in a Field, with error">
            <Field label="Job description" error="Paste at least 200 characters.">
              <Textarea placeholder="Paste the posting here" />
            </Field>
          </Specimen>
          <Specimen label="read-only / disabled">
            <div className="kit-gallery__specimen">
              <Textarea aria-label="Read-only" readOnly rows={2} defaultValue="Read-only text that can still be selected." />
              <Textarea aria-label="Disabled" disabled rows={2} defaultValue="Disabled text." />
            </div>
          </Specimen>
        </Grid>
      </Group>

      <Group title="FileInput (pick a file to see its name and size; the real input stays in the tab order)">
        <Grid>
          <Specimen label="inline, with hint">
            <FileInput aria-label="Resume file" accept=".pdf,.docx" hint={'PDF or DOCX, up to 5\u00a0MB'} />
          </Specimen>
          <Specimen label="in a Field, optional">
            <Field label="Resume" optional help="We read it once to pre-fill your profile.">
              <FileInput accept=".pdf,.docx" />
            </Field>
          </Specimen>
          <Specimen label="in a Field, with error">
            <Field label="Resume" error={'That file is larger than 5\u00a0MB.'}>
              <FileInput accept=".pdf,.docx" />
            </Field>
          </Specimen>
          <Specimen label="dropzone (drag a file onto it, or click anywhere on it)">
            <FileInput variant="dropzone" aria-label="Drop a resume" accept=".pdf,.docx" label="Choose a file" hint="Drop a PDF or DOCX here, or choose one." />
          </Specimen>
          <Specimen label="dropzone with an icon (compact target: disc, hint, trigger; the whole area opens the picker, so the hint names the file, not a gesture phones lack)">
            <FileInput
              variant="dropzone"
              icon={<Upload />}
              aria-label="Drop a resume (compact)"
              accept=".pdf,.docx"
              hint={'PDF or DOCX, up to 10\u00a0MB'}
            />
          </Specimen>
          <Specimen label="primary, lg, multiple">
            <FileInput aria-label="Attachments" multiple buttonVariant="primary" size="lg" />
          </Specimen>
          <Specimen label="sm, ghost">
            <FileInput aria-label="Small file" size="sm" buttonVariant="ghost" />
          </Specimen>
          <Specimen label="disabled">
            <FileInput aria-label="Disabled file" disabled hint="Uploads are paused." />
          </Specimen>
        </Grid>
      </Group>

      <Group title="DateField">
        <Grid>
          <Specimen label="empty">
            <DateField aria-label="Due date empty" />
          </Specimen>
          <Specimen label="with value">
            <DateDemo />
          </Specimen>
          <Specimen label="in a Field, with error">
            <Field label="Deadline" error="The deadline cannot be in the past.">
              <DateField defaultValue="2020-01-15" />
            </Field>
          </Specimen>
          <Specimen label="sm">
            <DateField size="sm" aria-label="Due date small" defaultValue="2026-12-01" />
          </Specimen>
          <Specimen label="disabled">
            <DateField disabled aria-label="Due date disabled" defaultValue="2026-12-01" />
          </Specimen>
        </Grid>
      </Group>
    </GallerySection>
  )
}

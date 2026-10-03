import { useEffect, useRef, useState } from 'react'
import { ArrowRight, Download, Plus, Search, Trash2, X } from 'lucide-react'
import { Button, Count, type ButtonSize, type ButtonVariant } from '#/components/kit'
import { GallerySection, Group, Row, Specimen } from './gallery-parts'

const VARIANTS: ButtonVariant[] = ['primary', 'secondary', 'ghost', 'destructive', 'link']
const SIZES: ButtonSize[] = ['sm', 'md', 'lg']

function SaveDemo() {
  const [loading, setLoading] = useState(false)
  const timer = useRef<number | undefined>(undefined)
  useEffect(() => () => window.clearTimeout(timer.current), [])
  return (
    <Button
      loading={loading}
      onClick={() => {
        setLoading(true)
        timer.current = window.setTimeout(() => setLoading(false), 1800)
      }}
    >
      Save changes
    </Button>
  )
}

function PressedDemo() {
  const [on, setOn] = useState(false)
  return (
    <Button variant="secondary" aria-pressed={on} onClick={() => setOn((value) => !value)}>
      Favorites only
    </Button>
  )
}

export function ButtonSection() {
  return (
    <GallerySection
      id="button"
      title="Button"
      note="One primary (filled forest) per view. Hover and active change colour only. Heights 28, 32, 36 on desktop; every size is 44 on touch devices."
    >
      <Group title="Variants and sizes">
        {VARIANTS.map((variant) => (
          <div key={variant} className="kit-gallery__variant">
            <span className="kit-gallery__label">{variant}</span>
            <Row>
              {SIZES.map((size) => (
                <Button key={size} variant={variant} size={size}>
                  {variant === 'link' ? 'Open application' : 'Save changes'}
                </Button>
              ))}
            </Row>
          </div>
        ))}
      </Group>

      <Group title="With icons">
        <Row>
          <Button>
            <Plus aria-hidden="true" />
            Add application
          </Button>
          <Button variant="secondary">
            <Download aria-hidden="true" />
            Export PDF
          </Button>
          <Button variant="ghost">
            Continue
            <ArrowRight aria-hidden="true" />
          </Button>
          <Button variant="secondary" size="sm">
            Filters
            <Count value={3} />
          </Button>
          <Button variant="destructive">
            <Trash2 aria-hidden="true" />
            Delete
          </Button>
        </Row>
      </Group>

      <Group title="Icon only (aria-label required)">
        <div className="kit-gallery__variant">
          <span className="kit-gallery__label">ghost</span>
          <Row>
            {SIZES.map((size) => (
              <Button key={size} iconOnly variant="ghost" size={size} aria-label={`Close (${size})`}>
                <X aria-hidden="true" />
              </Button>
            ))}
          </Row>
        </div>
        <div className="kit-gallery__variant">
          <span className="kit-gallery__label">secondary</span>
          <Row>
            {SIZES.map((size) => (
              <Button key={size} iconOnly variant="secondary" size={size} aria-label={`Search (${size})`}>
                <Search aria-hidden="true" />
              </Button>
            ))}
          </Row>
        </div>
        <div className="kit-gallery__variant">
          <span className="kit-gallery__label">primary</span>
          <Row>
            {SIZES.map((size) => (
              <Button key={size} iconOnly size={size} aria-label={`Add (${size})`}>
                <Plus aria-hidden="true" />
              </Button>
            ))}
          </Row>
        </div>
      </Group>

      <Group title="Disabled">
        {VARIANTS.map((variant) => (
          <div key={variant} className="kit-gallery__variant">
            <span className="kit-gallery__label">{variant}</span>
            <Row>
              <Button variant={variant} disabled>
                Save changes
              </Button>
              <Button variant={variant} disabled iconOnly aria-label={`Add (${variant}, disabled)`}>
                <Plus aria-hidden="true" />
              </Button>
            </Row>
          </div>
        ))}
      </Group>

      <Group title="Loading (width is kept, clicks are ignored, focus stays)">
        <Row>
          {VARIANTS.map((variant) => (
            <Button key={variant} variant={variant} loading>
              Save changes
            </Button>
          ))}
          <Button size="sm" loading>
            Small
          </Button>
          <Button size="lg" loading>
            Large
          </Button>
          <Button iconOnly variant="secondary" loading aria-label="Refreshing">
            <Plus aria-hidden="true" />
          </Button>
        </Row>
        <Row>
          <Specimen label="click to load for 1.8s">
            <SaveDemo />
          </Specimen>
        </Row>
      </Group>

      <Group title="Toggle, link and long label">
        <Row>
          <Specimen label="aria-pressed">
            <PressedDemo />
          </Specimen>
          <Specimen label="aria-pressed (ghost, on)">
            <Button variant="ghost" aria-pressed>
              Starred
            </Button>
          </Specimen>
          <Specimen label="asChild (anchor)">
            <Button asChild variant="secondary">
              <a href="#button">Back to buttons</a>
            </Button>
          </Specimen>
          <Specimen label="asChild, disabled">
            <Button asChild variant="secondary" disabled>
              <a href="#button">Unavailable link</a>
            </Button>
          </Specimen>
          <Specimen label="asChild, loading">
            <Button asChild variant="secondary" loading>
              <a href="#button">Loading link</a>
            </Button>
          </Specimen>
        </Row>
        <Row>
          <Specimen label="long label: one line when there is room">
            <Button variant="secondary">Generate a tailored cover letter for this application</Button>
          </Specimen>
          <Specimen label="long label in a 20rem column: wraps inside the border, never spills out">
            <div className="kit-gallery__bounded">
              <Button variant="secondary">Generate a tailored cover letter for this application</Button>
            </div>
          </Specimen>
          <Specimen label="long label in 12rem, with icon, primary and loading">
            <div className="kit-gallery__medium">
              <Button>
                <Plus aria-hidden="true" />
                Add a job to compare against your resume
              </Button>
              <Button loading variant="secondary">
                Generate a tailored cover letter for this application
              </Button>
            </div>
          </Specimen>
        </Row>
      </Group>

      <Group title="Auto-width layouts: an auto grid track and a shrinkable flex row keep the label whole; a plain table cell gives up at the whole-word level unless its button is nowrap">
        <div className="kit-gallery__grid kit-gallery__grid--wide">
          <Specimen label="plain auto-layout table, 26rem wide: row 1 squeezed to whole words (never mid-word); row 2, white-space: nowrap on the buttons, keeps one line (the kit Table does this itself)">
            <table className="kit-gallery__auto-table" data-testid="button-auto-table">
              <tbody>
                <tr>
                  <td>A long description cell with many words, so it competes with the buttons for the row</td>
                  <td>
                    <Button size="sm" variant="secondary">
                      Save changes
                    </Button>
                  </td>
                  <td>
                    <Button>Generate letter</Button>
                  </td>
                </tr>
                <tr>
                  <td>The same row with white-space: nowrap on its buttons</td>
                  <td className="kit-gallery__nowrap">
                    <Button size="sm" variant="secondary">
                      Save changes
                    </Button>
                  </td>
                  <td className="kit-gallery__nowrap">
                    <Button>Generate letter</Button>
                  </td>
                </tr>
              </tbody>
            </table>
          </Specimen>
          <Specimen label="grid, auto + 1fr, 20rem wide">
            <div className="kit-gallery__auto-grid" data-testid="button-auto-grid">
              <Button variant="secondary">Export resume</Button>
              <span>Words in the other column wrap, the button stays whole.</span>
            </div>
          </Specimen>
          <Specimen label="flex row that may shrink, 20rem wide">
            <div className="kit-gallery__auto-flex" data-testid="button-auto-flex">
              <span>Some text that wants all the room it can get in this row</span>
              <Button size="sm" variant="secondary">
                Save changes
              </Button>
            </div>
          </Specimen>
        </div>
      </Group>
    </GallerySection>
  )
}

import { CircleHelp, Copy, Info, Trash2 } from 'lucide-react'
import {
  Button,
  Field,
  Input,
  Kbd,
  Popover,
  PopoverClose,
  PopoverContent,
  PopoverTrigger,
  Tooltip,
} from '#/components/kit'
import { GallerySection, Group, Row, Specimen, Stage } from './gallery-parts'

function ScorePopover() {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button iconOnly variant="ghost" size="sm" aria-label="What does this score mean?">
          <CircleHelp aria-hidden="true" />
        </Button>
      </PopoverTrigger>
      <PopoverContent>
        <p>
          This score reflects the structural quality of your resume: sections, quantified achievements, clarity and completeness.
          When a job description is provided, it measures role-specific fit instead.
        </p>
      </PopoverContent>
    </Popover>
  )
}

function FormPopover() {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="secondary">Set a reminder</Button>
      </PopoverTrigger>
      <PopoverContent aria-label="Set a reminder" className="kit-gallery__popover-form">
        <Field label="Remind me on">
          <Input type="date" />
        </Field>
        <div className="kit-gallery__actions">
          <PopoverClose asChild>
            <Button size="sm" variant="ghost">
              Cancel
            </Button>
          </PopoverClose>
          <PopoverClose asChild>
            <Button size="sm">Save</Button>
          </PopoverClose>
        </div>
      </PopoverContent>
    </Popover>
  )
}

export function FloatingSection() {
  return (
    <GallerySection
      id="floating"
      title="Popover and Tooltip"
      note="A tooltip is a label for hover and keyboard focus: a tap does not open it, so never put anything essential in one. A popover opens on click or tap and can hold text or a few controls."
    >
      <Group title="At rest (static copies)">
        <Row top>
          <Specimen label="tooltip">
            <Stage label="Static preview of a tooltip" className="kit-gallery__stage--plain">
              <div className="kit-tooltip">Copy link</div>
            </Stage>
          </Specimen>
          <Specimen label="tooltip with shortcut">
            <Stage label="Static preview of a tooltip with a shortcut" className="kit-gallery__stage--plain">
              <div className="kit-tooltip">
                Search
                <Kbd>⌘K</Kbd>
              </div>
            </Stage>
          </Specimen>
          <Specimen label="popover">
            <Stage label="Static preview of a popover" className="kit-gallery__stage--plain">
              <div className="kit-popover">
                <p>This score reflects the structural quality of your resume: sections, quantified achievements and clarity.</p>
              </div>
            </Stage>
          </Specimen>
        </Row>
      </Group>

      <Group title="Tooltip (hover or Tab to the button)">
        <Row>
          <Tooltip content="Copy link">
            <Button iconOnly variant="ghost" aria-label="Copy link">
              <Copy aria-hidden="true" />
            </Button>
          </Tooltip>
          <Tooltip content="Delete application" side="bottom">
            <Button iconOnly variant="ghost" aria-label="Delete application">
              <Trash2 aria-hidden="true" />
            </Button>
          </Tooltip>
          <Tooltip content="Search" shortcut="⌘K" side="right">
            <Button variant="secondary">Search</Button>
          </Tooltip>
          <Tooltip content="Add a job description first to run a match">
            <span tabIndex={0} className="kit-gallery__wrap">
              <Button disabled>Run match</Button>
            </span>
          </Tooltip>
          <Tooltip content="A longer explanation wraps onto a second line instead of stretching across the page, up to 20rem." side="bottom">
            <Button iconOnly variant="ghost" aria-label="More about wrapping">
              <Info aria-hidden="true" />
            </Button>
          </Tooltip>
        </Row>
      </Group>

      <Group title="Tooltip on a status a script focuses (openOnFocusVisibleOnly: Tab or hover opens it, a tap or a scripted focus after a click does not)">
        <Row>
          <Tooltip content="Last saved 10:52. Checked for newer versions when you opened it." side="bottom" align="start" openOnFocusVisibleOnly>
            <span tabIndex={0} className="kit-gallery__wrap">Saved just now</span>
          </Tooltip>
        </Row>
      </Group>

      <Group title="Popover (click or tap)">
        <Row>
          <ScorePopover />
          <FormPopover />
        </Row>
      </Group>
    </GallerySection>
  )
}

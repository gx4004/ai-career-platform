import { useEffect, useRef, useState } from 'react'
import { Trash2, X } from 'lucide-react'
import {
  Button,
  ConfirmDialog,
  Dialog,
  DialogBody,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogForm,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  Field,
  Input,
  Textarea,
  type DialogSize,
} from '#/components/kit'
import { GallerySection, Grid, Group, Row, Specimen, Stage } from './gallery-parts'

const PARAGRAPHS = [
  'Your CV is built from the facts in your Evidence Profile, so a change here updates every document that uses them. Nothing is sent anywhere until you export or apply.',
  'Dates are shown the way you entered them. If a role is current, leave the end date empty and it will read "Present" on the page.',
  'Long bodies scroll inside the dialog while the title and the buttons stay where they are. The panel never grows taller than the window minus a 16px gutter.',
  'Keyboard: Tab stays inside the dialog, Esc closes it, and focus goes back to the button that opened it.',
]

function SizeDialog({ size, label }: { size: DialogSize; label: string }) {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="secondary">{label}</Button>
      </DialogTrigger>
      <DialogContent size={size}>
        <DialogHeader>
          <DialogTitle>Rename this CV</DialogTitle>
          <DialogDescription>The name is only for you; it is not printed on the document.</DialogDescription>
        </DialogHeader>
        <DialogBody>
          <p>Size {size}. The panel is never wider than the window minus 16px on each side.</p>
        </DialogBody>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="secondary">Cancel</Button>
          </DialogClose>
          <DialogClose asChild>
            <Button>Save name</Button>
          </DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function FormDialog() {
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [error, setError] = useState<string | null>(null)
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next)
        if (!next) {
          setName('')
          setError(null)
        }
      }}
    >
      <DialogTrigger asChild>
        <Button variant="secondary">Form dialog</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogForm
          onSubmit={(event) => {
            event.preventDefault()
            if (!name.trim()) {
              setError('Give the CV a name.')
              return
            }
            setOpen(false)
          }}
        >
          <DialogHeader>
            <DialogTitle>New CV</DialogTitle>
            <DialogDescription>Start from your profile. You can change everything afterwards.</DialogDescription>
          </DialogHeader>
          <DialogBody>
            <div className="kit-gallery__form">
              <Field label="Name" error={error ?? undefined}>
                <Input value={name} onChange={(event) => setName(event.target.value)} placeholder="Backend roles, 2026" />
              </Field>
              <Field label="Notes" optional help="Only you see this.">
                <Textarea rows={3} />
              </Field>
            </div>
          </DialogBody>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="secondary">Cancel</Button>
            </DialogClose>
            <Button type="submit">Create CV</Button>
          </DialogFooter>
        </DialogForm>
      </DialogContent>
    </Dialog>
  )
}

function LongDialog() {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="secondary">Long content</Button>
      </DialogTrigger>
      <DialogContent size="lg">
        <DialogHeader>
          <DialogTitle>How your CV is built</DialogTitle>
          <DialogDescription>Scroll: the title and the buttons stay in place.</DialogDescription>
        </DialogHeader>
        <DialogBody>
          {Array.from({ length: 4 }, (_, round) =>
            PARAGRAPHS.map((text, index) => (
              <p key={`${round}-${index}`} className="kit-gallery__paragraph">
                {text}
              </p>
            )),
          )}
        </DialogBody>
        <DialogFooter>
          <DialogClose asChild>
            <Button>Done</Button>
          </DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function ConfirmDemo({ tone }: { tone: 'destructive' | 'default' }) {
  const [open, setOpen] = useState(false)
  const [pending, setPending] = useState(false)
  const timer = useRef<number | undefined>(undefined)
  useEffect(() => () => window.clearTimeout(timer.current), [])
  const destructive = tone === 'destructive'
  return (
    <>
      <Button variant="secondary" onClick={() => setOpen(true)}>
        {destructive ? 'Delete application' : 'Archive application'}
      </Button>
      <ConfirmDialog
        open={open}
        onOpenChange={setOpen}
        tone={tone}
        pending={pending}
        title={destructive ? 'Delete this application?' : 'Archive this application?'}
        description={
          destructive
            ? 'Northwind Labs, Senior Backend Engineer. Its notes, tasks and documents are removed for good.'
            : 'It moves out of your board. You can restore it from the archive.'
        }
        confirmLabel={destructive ? 'Delete application' : 'Archive'}
        icon={destructive ? <Trash2 aria-hidden="true" /> : undefined}
        onConfirm={() => {
          setPending(true)
          timer.current = window.setTimeout(() => {
            setPending(false)
            setOpen(false)
          }, 1600)
        }}
      />
    </>
  )
}

function SilentTitleDialog() {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="secondary">Hidden title, no close button</Button>
      </DialogTrigger>
      <DialogContent size="sm" showClose={false} aria-describedby={undefined}>
        <DialogHeader>
          <DialogTitle visuallyHidden>Sign in</DialogTitle>
        </DialogHeader>
        <DialogBody>
          <p>The title is still announced to screen readers; here the form supplies its own heading.</p>
        </DialogBody>
        <DialogFooter>
          <DialogClose asChild>
            <Button>Close</Button>
          </DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function StaticDialog({ size, long = false }: { size: DialogSize; long?: boolean }) {
  return (
    <Dialog open>
      <div className="kit-dialog" data-size={size} data-closable="true">
        <DialogHeader>
          <DialogTitle>{long ? 'How your CV is built' : 'Rename this CV'}</DialogTitle>
          <DialogDescription>
            {long ? 'Scroll: the title and the buttons stay in place.' : 'The name is only for you; it is not printed on the document.'}
          </DialogDescription>
        </DialogHeader>
        <DialogBody>
          {long ? PARAGRAPHS.concat(PARAGRAPHS).map((text, index) => <p key={index} className="kit-gallery__paragraph">{text}</p>) : <Input aria-label="CV name" defaultValue="Backend roles, 2026" />}
        </DialogBody>
        <DialogFooter>
          <Button variant="secondary">Cancel</Button>
          <Button>Save name</Button>
        </DialogFooter>
        <Button type="button" iconOnly variant="ghost" size="sm" className="kit-panel__close" aria-label="Close">
          <X aria-hidden="true" />
        </Button>
      </div>
    </Dialog>
  )
}

function StaticConfirm() {
  return (
    <Dialog open>
      <div className="kit-dialog" data-size="sm">
        <DialogHeader data-tone="danger">
          <DialogTitle>Delete this application?</DialogTitle>
          <DialogDescription>Northwind Labs, Senior Backend Engineer. Its notes, tasks and documents are removed for good.</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="secondary">Cancel</Button>
          <Button variant="destructive">
            <Trash2 aria-hidden="true" />
            Delete application
          </Button>
        </DialogFooter>
      </div>
    </Dialog>
  )
}

export function DialogSection() {
  return (
    <GallerySection
      id="dialog"
      title="Dialog"
      note="White modal panel with the 2px ink outline, radius 24 and the 7px hard shadow, on a flat plum scrim (no blur). Header and footer are ruled off with 2px ink lines; the destructive confirm has a rose-soft header band. Focus is trapped and returns to the trigger, Esc and an outside click close it, the page behind does not scroll. The previews are static copies; the buttons open the real thing."
    >
      <Group title="At rest (static previews)">
        <Grid wide>
          <Specimen label="sm: destructive confirm">
            <Stage label="Static preview of a small dialog">
              <StaticConfirm />
            </Stage>
          </Specimen>
          <Specimen label="md: form">
            <Stage label="Static preview of a medium dialog">
              <StaticDialog size="md" />
            </Stage>
          </Specimen>
        </Grid>
        <Specimen label="lg: long body scrolls inside the panel">
          <Stage label="Static preview of a long dialog" className="kit-gallery__stage--tall">
            <StaticDialog size="lg" long />
          </Stage>
        </Specimen>
      </Group>

      <Group title="Sizes (open them)">
        <Row>
          <SizeDialog size="sm" label="Small (400)" />
          <SizeDialog size="md" label="Medium (512)" />
          <SizeDialog size="lg" label="Large (720)" />
        </Row>
      </Group>

      <Group title="Content">
        <Row>
          <FormDialog />
          <LongDialog />
          <SilentTitleDialog />
        </Row>
      </Group>

      <Group title="Confirm (ConfirmDialog preset)">
        <Row>
          <ConfirmDemo tone="destructive" />
          <ConfirmDemo tone="default" />
        </Row>
        <p className="kit-gallery__section-note">
          Opens focused on Cancel. While the action runs, Esc and an outside click are ignored and the confirm button shows a spinner.
        </p>
      </Group>
    </GallerySection>
  )
}

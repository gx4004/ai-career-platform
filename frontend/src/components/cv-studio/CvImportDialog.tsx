import { useEffect, useState } from 'react'
import { ArrowUpToLine, ClipboardPaste, FileUp, MoveRight, Trash2, Upload } from 'lucide-react'
import {
  Badge, Button, Card, CardHeader, CardTitle, Dialog, DialogBody, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuTrigger,
  Field, FileInput, Input, List, Notice, Section, Segmented, Skeleton, Stack, Textarea,
} from '#/components/kit'
import { acceptCvImport, proposeCvImport } from '#/lib/api/client'
import type { CvDocument, CvImportProposal } from '#/lib/api/schemas'
import { isStructuredKind } from '#/lib/cv-studio/editor'
import {
  countEntries, mergeIntoPrevious, moveImportEntry, removeImportEntry, toAcceptable, updateImportEntry,
} from './importReview'
import type { ImportEntry, ImportSection } from './importReview'

/** The name and contact block the reader found (document-level); every field is optional. */
type HeaderField = 'name' | 'headline' | 'email' | 'phone' | 'location'
const HEADER_FIELDS: { key: HeaderField; label: string }[] = [
  { key: 'name', label: 'Your name' }, { key: 'headline', label: 'Headline' }, { key: 'email', label: 'Email' },
  { key: 'phone', label: 'Phone' }, { key: 'location', label: 'Location' },
]

/**
 * The reader repeats a qualification or role as its description when it found none ("BA Interaction Design"
 * twice). Shown as an empty, optional description instead; accepting fills the body back in from the heading.
 */
const withoutEchoedBodies = (proposal: CvImportProposal): CvImportProposal => ({
  ...proposal,
  sections: proposal.sections.map((section) => isStructuredKind(section.kind) ? {
    ...section,
    entries: section.entries.map((entry) => !entry.bullets?.length && entry.heading?.trim() && entry.body.trim() === entry.heading.trim()
      ? { ...entry, body: '' }
      : entry),
  } : section),
})

const sectionNoun = (kind: ImportSection['kind']) => kind === 'education' ? 'qualification' : kind === 'projects' ? 'project' : 'role'

/** One thing the reader found, as a card you can correct before it becomes your CV. */
function EntryCard({ section, entry, index, sections, onChange, onMerge, onMove, onRemove }: {
  section: ImportSection; entry: ImportEntry; index: number; sections: ImportSection[]
  onChange: (patch: Partial<ImportEntry>) => void
  onMerge: () => void; onMove: (toSectionId: string) => void; onRemove: () => void
}) {
  const structured = isStructuredKind(section.kind)
  // One highlight per line; read from the entry itself, so a merge into this card shows at once.
  const lines = (entry.bullets ?? []).join('\n')
  const hasBullets = (entry.bullets?.length ?? 0) > 0
  const title = entry.heading?.trim() || (structured ? `Unnamed ${sectionNoun(section.kind)}` : `Entry ${index + 1}`)
  // Only a section of the same shape can take the entry: a role moved into Summary kept a title, company and dates that
  // Summary cannot show or edit, yet printed them (cv-studio-G08).
  const others = sections.filter((candidate) => candidate.id !== section.id && isStructuredKind(candidate.kind) === structured)
  const text = (key: 'heading' | 'subheading' | 'start_date' | 'end_date', label: string, placeholder?: string, wide = false) => (
    <Field label={label} className={wide ? 'cvs-review__wide' : undefined}>
      <Input value={entry[key] ?? ''} maxLength={key.endsWith('date') ? 40 : 200} placeholder={placeholder} onChange={(event) => onChange({ [key]: event.target.value })} />
    </Field>
  )

  return (
    <Card className="cvs-review__card" padding="sm" aria-label={title} data-entry-id={entry.id}>
      <CardHeader>
        <CardTitle headingLevel={4}>{title}</CardTitle>
        {entry.claim ? <Badge size="sm" tone="lilac">Fact for your profile</Badge> : null}
      </CardHeader>
      {structured ? (
        <div className="cvs-review__grid">
          {text('heading', sectionNoun(section.kind) === 'role' ? 'Job title' : sectionNoun(section.kind) === 'project' ? 'Project name' : 'Qualification', undefined, true)}
          {text('subheading', section.kind === 'education' ? 'School or university' : section.kind === 'projects' ? 'Organisation or client' : 'Company', undefined, true)}
          {text('start_date', 'Start', 'Jan 2022')}
          {text('end_date', 'End', 'Present')}
        </div>
      ) : null}
      {hasBullets || (structured && lines) ? (
        <Field label="Highlights" help="One per line.">
          <Textarea
            autosize rows={3} maxRows={8} value={lines} maxLength={30_000}
            onChange={(event) => onChange({ bullets: event.target.value.split('\n') })}
          />
        </Field>
      ) : (
        <Field label={structured ? 'Description' : 'Text'}>
          <Textarea
            autosize rows={2} maxRows={8} value={entry.body} maxLength={5_000} placeholder={structured ? 'Optional' : undefined}
            onChange={(event) => onChange({ body: event.target.value })}
          />
        </Field>
      )}
      <div className="cvs-review__actions">
        <Button type="button" size="sm" variant="secondary" disabled={index === 0} onClick={onMerge}>
          <ArrowUpToLine aria-hidden="true" /> Merge into previous
        </Button>
        {others.length > 0 ? (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button type="button" size="sm" variant="secondary"><MoveRight aria-hidden="true" /> Move to section</Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start">
              <DropdownMenuLabel>Move to</DropdownMenuLabel>
              {others.map((target) => <DropdownMenuItem key={target.id} onSelect={() => onMove(target.id)}>{target.title}</DropdownMenuItem>)}
            </DropdownMenuContent>
          </DropdownMenu>
        ) : null}
        <Button type="button" size="sm" variant="ghost" onClick={onRemove}><Trash2 aria-hidden="true" /> Leave out</Button>
      </div>
    </Card>
  )
}

export function CvImportDialog({ open, onOpenChange, onImported, onCloseAutoFocus }: {
  open: boolean; onOpenChange: (open: boolean) => void; onImported: (document: CvDocument) => void
  /** Where focus goes on close, when the control that opened the dialog is gone (a menu item). */
  onCloseAutoFocus?: (event: Event) => void
}) {
  const [proposal, setProposal] = useState<CvImportProposal | null>(null)
  const [name, setName] = useState('')
  const [state, setState] = useState<'idle' | 'reading' | 'creating'>('idle')
  const [error, setError] = useState('')
  const [fileName, setFileName] = useState('')
  const [source, setSource] = useState<'file' | 'text'>('file')
  const [pasted, setPasted] = useState('')
  // FileInput cannot be reset from outside; a new key starts it empty again after a failed read.
  const [pickerKey, setPickerKey] = useState(0)
  /**
   * The card focus goes to after a move (the moved entry, in its new section) or a merge (the entry it joined): the
   * control that was used went with the old card.
   */
  const [moved, setMoved] = useState<string | null>(null)
  useEffect(() => {
    if (!moved) return
    // After the closed menu has handed focus back to its trigger, which went with the old card.
    const timer = window.setTimeout(() => {
      const card = Array.from(document.querySelectorAll<HTMLElement>('[data-entry-id]')).find((element) => element.dataset.entryId === moved)
      card?.querySelector<HTMLElement>('input, textarea')?.focus()
      setMoved(null)
    }, 0)
    return () => window.clearTimeout(timer)
  }, [moved])

  useEffect(() => {
    if (!open) return
    setProposal(null); setName(''); setError(''); setState('idle'); setPasted(''); setSource('file')
  }, [open])

  async function read(file: File | undefined, from: 'file' | 'text' = 'file') {
    if (!file) return
    setState('reading'); setError(''); setFileName(file.name)
    try {
      const next = await proposeCvImport(file)
      setProposal(withoutEchoedBodies(next))
      // The CV's name becomes the file name of every export: the person's name beats a file stem, and pasted text has none.
      const person = next.header?.name?.trim()
      setName(person ? `${person} CV` : from === 'text' ? 'My CV' : next.name)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'We couldn’t read that file.')
    } finally {
      setState('idle')
      setPickerKey((key) => key + 1)
    }
  }

  const readPasted = () => void read(new File([pasted], 'pasted-cv.txt', { type: 'text/plain' }), 'text')

  async function create() {
    if (!proposal || !name.trim()) return
    setState('creating'); setError('')
    try {
      const document = await acceptCvImport(toAcceptable(proposal, name))
      onImported(document)
      onOpenChange(false)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'We couldn’t create your CV.')
    } finally {
      setState('idle')
    }
  }

  const edit = (change: (current: CvImportProposal) => CvImportProposal) => setProposal((current) => current && change(current))
  const entryCount = proposal ? countEntries(proposal) : 0
  const busy = state !== 'idle'
  const header = proposal?.header

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size={proposal ? 'lg' : 'md'} dismissible={!busy} onCloseAutoFocus={onCloseAutoFocus}>
        <DialogHeader>
          <DialogTitle>Import your CV</DialogTitle>
          <DialogDescription>
            {proposal
              ? `We found ${proposal.sections.length} ${proposal.sections.length === 1 ? 'section' : 'sections'} and ${entryCount} ${entryCount === 1 ? 'entry' : 'entries'} ${source === 'text' ? 'in the text you pasted' : `in ${proposal.filename}`}. Fix anything that looks off, then create your CV.`
              : 'Upload a PDF or Word file, or paste your CV as text. We’ll split it into sections you can edit, and nothing is saved until you say so.'}
          </DialogDescription>
        </DialogHeader>

        <DialogBody className="cvs-import__body">
          <Stack gap={4}>
            {!proposal ? (
              state === 'reading' ? (
                <Stack gap={3}>
                  <p className="cvs-hint" role="status">Reading {source === 'text' ? 'the text you pasted' : fileName}…</p>
                  <List aria-label="Reading your CV" aria-busy="true"><Skeleton variant="row" as="li" density="compact" count={4} /></List>
                </Stack>
              ) : (
                <>
                  <Segmented
                    aria-label="How to add your CV" value={source} onValueChange={(next) => setSource(next as 'file' | 'text')}
                    options={[{ value: 'file', label: 'Upload a file', icon: <FileUp aria-hidden="true" /> }, { value: 'text', label: 'Paste text', icon: <ClipboardPaste aria-hidden="true" /> }]}
                  />
                  {source === 'file' ? (
                    <FileInput
                      key={pickerKey}
                      variant="dropzone"
                      // The tool pages' dropzone (consistency-F08): icon disc, the formats as the hint, then "Choose file".
                      icon={<Upload />}
                      hint={'PDF or DOCX, up to 10\u00a0MB'}
                      accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                      onFilesChange={([file]) => void read(file)}
                    />
                  ) : (
                    <Field label="Your CV as text" help="Paste everything: name, roles, dates, skills. We read it the same way as a file.">
                      <Textarea autosize rows={8} maxRows={14} value={pasted} maxLength={200_000} placeholder="Paste your CV here." onChange={(event) => setPasted(event.target.value)} />
                    </Field>
                  )}
                </>
              )
            ) : (
              <>
                <Card as="div" role="region" tone="lilac" padding="sm" className="cvs-review__head" aria-label="Name and contact details">
                  <Field label="CV name">
                    <Input value={name} maxLength={120} onChange={(event) => setName(event.target.value)} />
                  </Field>
                  {header ? (
                    <div className="cvs-review__grid">
                      {HEADER_FIELDS.map(({ key, label }) => (
                        <Field key={key} label={label}>
                          <Input
                            value={header[key] ?? ''} maxLength={key === 'phone' ? 40 : 200}
                            onChange={(event) => edit((current) => ({ ...current, header: { ...current.header, [key]: event.target.value } }))}
                          />
                        </Field>
                      ))}
                    </div>
                  ) : null}
                </Card>
                {proposal.warnings.map((warning) => (
                  <Notice key={warning} tone="warning">{warning}</Notice>
                ))}
                {proposal.sections.map((section) => (
                  <Section key={section.id} headingLevel={3} title={section.title} count={section.entries.length} countTone="white">
                    {section.entries.length === 0 ? <p className="cvs-hint">Nothing was found under this heading.</p> : (
                      <Stack gap={3}>
                        {section.entries.map((entry, index) => (
                          <EntryCard
                            key={entry.id}
                            section={section} entry={entry} index={index} sections={proposal.sections}
                            onChange={(patch) => edit((current) => updateImportEntry(current, section.id, entry.id, patch))}
                            onMerge={() => { setMoved(section.entries[index - 1]?.id ?? null); edit((current) => mergeIntoPrevious(current, section.id, entry.id)) }}
                            onMove={(toId) => { setMoved(entry.id); edit((current) => moveImportEntry(current, section.id, entry.id, toId)) }}
                            onRemove={() => edit((current) => removeImportEntry(current, section.id, entry.id))}
                          />
                        ))}
                      </Stack>
                    )}
                  </Section>
                ))}
                <p className="cvs-hint">Facts we spot, like achievements and skills, are also added to your profile as suggestions to review.</p>
              </>
            )}

            {error ? <Notice tone="danger">{error}</Notice> : null}
          </Stack>
        </DialogBody>

        <DialogFooter>
          {proposal ? (
            <Button type="button" variant="secondary" disabled={busy} onClick={() => setProposal(null)}>{source === 'text' ? 'Start over' : 'Choose another file'}</Button>
          ) : (
            <DialogClose asChild><Button type="button" variant="secondary" disabled={busy}>Cancel</Button></DialogClose>
          )}
          {proposal ? (
            <Button type="button" loading={state === 'creating'} disabled={!name.trim() || proposal.sections.length === 0} onClick={() => void create()}>
              Create my CV
            </Button>
          ) : source === 'text' ? (
            <Button type="button" loading={state === 'reading'} disabled={pasted.trim().length < 20 && state !== 'reading'} onClick={readPasted}>Read my CV</Button>
          ) : null}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

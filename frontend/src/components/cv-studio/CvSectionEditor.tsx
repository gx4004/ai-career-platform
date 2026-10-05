import { useState } from 'react'
import { ArrowDown, ArrowLeft, ArrowUp, Plus, Trash2, X } from 'lucide-react'
import {
  Badge, Button, Card, Cluster, ConfirmDialog, Disclosure, EmptyState, Field, Input, Section, Stack, Textarea,
} from '#/components/kit'
import type { CvEntry, CvSection } from '#/lib/api/schemas'
import {
  MAX_BULLETS, addBullet, addEntry, isStructuredKind, moveBullet, moveEntry, removeBullet, removeEntry,
  removeSection, sectionLabels, updateBullet, updateEntry,
} from '#/lib/cv-studio/editor'

type SectionsChange = (change: (sections: CvSection[]) => CvSection[]) => void

const FIELD_LABELS: Partial<Record<CvSection['kind'], { heading: string; subheading: string; noun: string }>> = {
  experience: { heading: 'Job title', subheading: 'Company', noun: 'role' },
  education: { heading: 'Qualification', subheading: 'School or university', noun: 'qualification' },
  projects: { heading: 'Project name', subheading: 'Organisation or client', noun: 'project' },
}

const FREEFORM_HINTS: Partial<Record<CvSection['kind'], string>> = {
  summary: 'Two or three sentences about who you are and what you do best.',
  skills: 'List skills separated by commas, e.g. Python, SQL, stakeholder management.',
  achievements: 'One result per entry. Numbers help: “Cut onboarding time by 30%”.',
}

const LinkedToEvidence = () => <Badge tone="success" size="sm">Linked to your Evidence</Badge>

/** Move up, move down and delete: the same three controls on every entry. */
function EntryTools({ name, index, count, onMove, onDelete }: {
  name: string; index: number; count: number; onMove: (delta: -1 | 1) => void; onDelete: () => void
}) {
  return (
    <>
      <Button type="button" iconOnly variant="ghost" size="sm" aria-label={`Move ${name} up`} disabled={index === 0} onClick={() => onMove(-1)}><ArrowUp aria-hidden="true" /></Button>
      <Button type="button" iconOnly variant="ghost" size="sm" aria-label={`Move ${name} down`} disabled={index === count - 1} onClick={() => onMove(1)}><ArrowDown aria-hidden="true" /></Button>
      <Button type="button" iconOnly variant="ghost" size="sm" aria-label={`Delete ${name}`} onClick={onDelete}><Trash2 aria-hidden="true" /></Button>
    </>
  )
}

function Bullet({ text, index, count, label, onChange, onMove, onRemove }: {
  text: string; index: number; count: number; label: string
  onChange: (value: string) => void; onMove: (delta: -1 | 1) => void; onRemove: () => void
}) {
  return (
    <li className="cvs-bullet">
      <Textarea
        autosize maxRows={8} rows={1} value={text} maxLength={1000}
        aria-label={`Highlight ${index + 1} for ${label}`}
        placeholder="What did you do, and what changed because of it?"
        onChange={(event) => onChange(event.target.value)}
      />
      <div className="cvs-bullet__tools">
        <Button type="button" iconOnly variant="ghost" size="sm" aria-label={`Move highlight ${index + 1} up`} disabled={index === 0} onClick={() => onMove(-1)}><ArrowUp aria-hidden="true" /></Button>
        <Button type="button" iconOnly variant="ghost" size="sm" aria-label={`Move highlight ${index + 1} down`} disabled={index === count - 1} onClick={() => onMove(1)}><ArrowDown aria-hidden="true" /></Button>
        <Button type="button" iconOnly variant="ghost" size="sm" aria-label={`Remove highlight ${index + 1}`} onClick={onRemove}><X aria-hidden="true" /></Button>
      </div>
    </li>
  )
}

function StructuredEntry({ section, entry, index, onSections }: {
  section: CvSection; entry: CvEntry; index: number; onSections: SectionsChange
}) {
  const labels = FIELD_LABELS[section.kind] ?? FIELD_LABELS.experience!
  const bullets = entry.bullets ?? []
  const set = (patch: Partial<CvEntry>) => onSections((sections) => updateEntry(sections, section.id, entry.id, patch))
  const cardTitle = entry.heading?.trim() || `New ${labels.noun}`
  const field = (key: 'heading' | 'subheading' | 'location' | 'start_date' | 'end_date', label: string, placeholder?: string, span = 'cvs-field--third') => (
    <Field label={label} className={span}>
      <Input value={entry[key] ?? ''} maxLength={key.endsWith('date') ? 40 : 200} placeholder={placeholder} onChange={(event) => set({ [key]: event.target.value })} />
    </Field>
  )

  return (
    <Card aria-label={cardTitle} padding="sm">
      <Section
        headingLevel={3}
        size="sm"
        title={cardTitle}
        actions={<EntryTools
          name={cardTitle} index={index} count={section.entries.length}
          onMove={(delta) => onSections((s) => moveEntry(s, section.id, index, delta))}
          onDelete={() => onSections((s) => removeEntry(s, section.id, entry.id))}
        />}
      >
        <Stack gap={3}>
          {entry.evidence_item_id ? <div><LinkedToEvidence /></div> : null}
          <div className="cvs-entry__grid">
            {field('heading', labels.heading, section.kind === 'experience' ? 'e.g. Product Designer' : undefined, 'cvs-field--full')}
            {field('subheading', labels.subheading, undefined, 'cvs-field--full')}
            {field('location', 'Location', 'City or Remote', 'cvs-field--third cvs-field--location')}
            {field('start_date', 'Start', 'Jan 2022')}
            {field('end_date', 'End', 'Present')}
          </div>
          {bullets.length > 0 ? (
            <Section headingLevel={4} size="sm" title="Highlights" rule={false}>
              <ul className="cvs-bullets" role="list">
                {bullets.map((bullet, bulletIndex) => (
                  // Bullets have no ids of their own; the index is their identity.
                  <Bullet
                    key={bulletIndex} text={bullet} index={bulletIndex} count={bullets.length} label={cardTitle}
                    onChange={(value) => onSections((s) => updateBullet(s, section.id, entry.id, bulletIndex, value))}
                    onMove={(delta) => onSections((s) => moveBullet(s, section.id, entry.id, bulletIndex, delta))}
                    onRemove={() => onSections((s) => removeBullet(s, section.id, entry.id, bulletIndex))}
                  />
                ))}
              </ul>
            </Section>
          ) : (
            <Field label="Description">
              <Textarea autosize maxRows={10} rows={3} maxLength={5000} value={entry.body} placeholder="A short description, or add highlights below." onChange={(event) => set({ body: event.target.value })} />
            </Field>
          )}
          <div>
            <Button type="button" variant="ghost" size="sm" disabled={bullets.length >= MAX_BULLETS} onClick={() => onSections((s) => addBullet(s, section.id, entry.id))}>
              <Plus aria-hidden="true" /> Add highlight
            </Button>
          </div>
        </Stack>
      </Section>
    </Card>
  )
}

function FreeformEntry({ section, entry, index, onSections, inline }: {
  section: CvSection; entry: CvEntry; index: number; onSections: SectionsChange; inline: boolean
}) {
  const only = section.entries.length === 1
  const label = only ? `${section.title} text` : `${section.title} entry ${index + 1}`
  const text = (
    <Textarea
      autosize maxRows={12} aria-label={label} rows={section.kind === 'summary' ? 4 : 2} maxLength={5000}
      value={entry.body} placeholder={FREEFORM_HINTS[section.kind] ?? 'Write this entry in your own words.'}
      onChange={(event) => onSections((s) => updateEntry(s, section.id, entry.id, { body: event.target.value }))}
    />
  )
  if (only && inline) {
    // The open row's header already names the section.
    return (
      <Stack gap={2}>
        {entry.evidence_item_id ? <div><LinkedToEvidence /></div> : null}
        {text}
      </Stack>
    )
  }
  if (only) {
    return (
      <Section headingLevel={3} size="sm" title={sectionLabels[section.kind]} rule={false}>
        <Stack gap={2}>
          {entry.evidence_item_id ? <div><LinkedToEvidence /></div> : null}
          {text}
        </Stack>
      </Section>
    )
  }
  return (
    <Card padding="sm">
      <Section
        headingLevel={3}
        size="sm"
        title={`Entry ${index + 1}`}
        actions={<EntryTools
          name={label} index={index} count={section.entries.length}
          onMove={(delta) => onSections((s) => moveEntry(s, section.id, index, delta))}
          onDelete={() => onSections((s) => removeEntry(s, section.id, entry.id))}
        />}
      >
        <Stack gap={3}>
          {entry.evidence_item_id ? <div><LinkedToEvidence /></div> : null}
          {text}
        </Stack>
      </Section>
    </Card>
  )
}

export function CvSectionEditor({ section, onSections, onBack, inline = false }: {
  section: CvSection; onSections: SectionsChange; onBack: () => void
  /** Unfolded inside its row of the sections list (the row's header folds it back): no "All sections" button. */
  inline?: boolean
}) {
  const [confirmRemove, setConfirmRemove] = useState(false)
  const structured = isStructuredKind(section.kind)
  const customTitle = section.title.trim() !== sectionLabels[section.kind]
  const addLabel = structured ? `Add ${FIELD_LABELS[section.kind]?.noun ?? 'entry'}` : 'Add entry'

  function remove() {
    if (section.entries.length > 0) setConfirmRemove(true)
    else onSections((sections) => removeSection(sections, section.id))
  }

  const renameField = (
    <Field label="Section name">
      <Input
        value={section.title} maxLength={120}
        onChange={(event) => onSections((sections) => sections.map((item) => item.id === section.id ? { ...item, title: event.target.value } : item))}
      />
    </Field>
  )

  return (
    <Stack gap={inline ? 4 : 6} role="group" aria-label={sectionLabels[section.kind]}>
      {inline ? null : (
        <Cluster justify="between" gap={3}>
          <Button type="button" variant="ghost" size="sm" onClick={onBack}><ArrowLeft aria-hidden="true" /> All sections</Button>
          <Button type="button" variant="ghost" size="sm" onClick={remove}><Trash2 aria-hidden="true" /> Remove section</Button>
        </Cluster>
      )}
      {inline ? null : renameField}
      {customTitle || !section.visible ? (
        <Cluster gap={2}>
          {customTitle ? <Badge size="sm">{sectionLabels[section.kind]}</Badge> : null}
          {!section.visible ? <Badge size="sm" tone="info">Hidden from your CV</Badge> : null}
        </Cluster>
      ) : null}
      {section.entries.length === 0 ? <EmptyState size="inline" title="Nothing here yet." /> : null}
      {section.entries.map((entry, index) => structured
        ? <StructuredEntry key={entry.id} section={section} entry={entry} index={index} onSections={onSections} />
        : <FreeformEntry key={entry.id} section={section} entry={entry} index={index} onSections={onSections} inline={inline} />)}
      <div className="cvs-editor__foot">
        <Button type="button" variant="secondary" size="sm" onClick={() => onSections((sections) => addEntry(sections, section.id))}>
          <Plus aria-hidden="true" /> {addLabel}
        </Button>
        {inline ? <Button type="button" variant="ghost" size="sm" onClick={remove}><Trash2 aria-hidden="true" /> Remove section</Button> : null}
      </div>
      {inline ? <Disclosure variant="inline" title="Rename section">{renameField}</Disclosure> : null}
      {inline ? <p className="cvs-hint">The page updates as you type.</p> : null}
      <ConfirmDialog
        open={confirmRemove} onOpenChange={setConfirmRemove}
        title={`Remove the ${section.title} section?`}
        description="Everything in it is removed from your CV. You can’t undo this."
        confirmLabel="Remove section" icon={<Trash2 />}
        onConfirm={() => { setConfirmRemove(false); onSections((sections) => removeSection(sections, section.id)) }}
      />
    </Stack>
  )
}

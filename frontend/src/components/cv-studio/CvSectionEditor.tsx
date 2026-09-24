import { useId } from 'react'
import { ArrowDown, ArrowUp, BadgeCheck, Plus, Trash2, X } from 'lucide-react'
import { Button } from '#/components/ui/button'
import type { CvEntry, CvSection } from '#/lib/api/schemas'
import {
  MAX_BULLETS, addBullet, addEntry, isStructuredKind, moveBullet, moveEntry, removeBullet, removeEntry,
  removeSection, sectionLabels, updateBullet, updateEntry,
} from '#/lib/cv-studio/editor'
import { cn } from '#/lib/utils'

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

function StructuredEntry({ section, entry, index, onSections }: {
  section: CvSection; entry: CvEntry; index: number; onSections: SectionsChange
}) {
  const uid = useId()
  const labels = FIELD_LABELS[section.kind] ?? FIELD_LABELS.experience!
  const bullets = entry.bullets ?? []
  const set = (patch: Partial<CvEntry>) => onSections((sections) => updateEntry(sections, section.id, entry.id, patch))
  const cardTitle = entry.heading?.trim() || `New ${labels.noun}`
  const field = (key: 'heading' | 'subheading' | 'location' | 'start_date' | 'end_date', label: string, placeholder?: string, className?: string) => (
    <div className={cn('cvs-field', className)}>
      <label htmlFor={`${uid}-${key}`}>{label}</label>
      <input
        id={`${uid}-${key}`} className="cvs-input" value={entry[key] ?? ''} maxLength={key.endsWith('date') ? 40 : 200}
        placeholder={placeholder} onChange={(event) => set({ [key]: event.target.value })}
      />
    </div>
  )

  return (
    <article className="cvs-entry cvs-entry--structured" aria-label={cardTitle}>
      <header className="cvs-entry__head">
        <p className="cvs-entry__title">{cardTitle}</p>
        {entry.evidence_item_id ? <span className="cvs-evidence-tag"><BadgeCheck size={13} aria-hidden="true" /> From your Evidence</span> : null}
        <span className="cvs-entry__tools">
          <Button type="button" variant="ghost" size="icon-sm" aria-label={`Move ${cardTitle} up`} disabled={index === 0} onClick={() => onSections((s) => moveEntry(s, section.id, index, -1))}><ArrowUp /></Button>
          <Button type="button" variant="ghost" size="icon-sm" aria-label={`Move ${cardTitle} down`} disabled={index === section.entries.length - 1} onClick={() => onSections((s) => moveEntry(s, section.id, index, 1))}><ArrowDown /></Button>
          <Button type="button" variant="ghost" size="icon-sm" aria-label={`Delete ${cardTitle}`} onClick={() => onSections((s) => removeEntry(s, section.id, entry.id))}><Trash2 /></Button>
        </span>
      </header>
      <div className="cvs-entry__grid">
        {field('heading', labels.heading, section.kind === 'experience' ? 'e.g. Product Designer' : undefined, 'cvs-field--wide')}
        {field('subheading', labels.subheading, undefined, 'cvs-field--wide')}
        {field('location', 'Location', 'City or Remote')}
        <div className="cvs-field-pair">
          {field('start_date', 'Start', 'Jan 2022')}
          {field('end_date', 'End', 'Present')}
        </div>
      </div>
      {bullets.length > 0 ? (
        <div className="cvs-bullets">
          <p className="cvs-bullets__label" id={`${uid}-bullets`}>Highlights</p>
          <ul aria-labelledby={`${uid}-bullets`}>
            {bullets.map((bullet, bulletIndex) => (
              // Bullets have no ids of their own; the index is their identity.
              <li key={bulletIndex} className="cvs-bullet">
                <span className="cvs-bullet__dot" aria-hidden="true" />
                <textarea
                  className="cvs-bullet__input" rows={1} value={bullet} maxLength={1000}
                  aria-label={`Highlight ${bulletIndex + 1} for ${cardTitle}`}
                  placeholder="What did you do, and what changed because of it?"
                  onChange={(event) => onSections((s) => updateBullet(s, section.id, entry.id, bulletIndex, event.target.value))}
                />
                <span className="cvs-bullet__tools">
                  <Button type="button" variant="ghost" size="icon-xs" aria-label={`Move highlight ${bulletIndex + 1} up`} disabled={bulletIndex === 0} onClick={() => onSections((s) => moveBullet(s, section.id, entry.id, bulletIndex, -1))}><ArrowUp /></Button>
                  <Button type="button" variant="ghost" size="icon-xs" aria-label={`Move highlight ${bulletIndex + 1} down`} disabled={bulletIndex === bullets.length - 1} onClick={() => onSections((s) => moveBullet(s, section.id, entry.id, bulletIndex, 1))}><ArrowDown /></Button>
                  <Button type="button" variant="ghost" size="icon-xs" aria-label={`Remove highlight ${bulletIndex + 1}`} onClick={() => onSections((s) => removeBullet(s, section.id, entry.id, bulletIndex))}><X /></Button>
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <div className="cvs-field">
          <label htmlFor={`${uid}-body`}>Description</label>
          <textarea
            id={`${uid}-body`} className="cvs-textarea" rows={3} maxLength={5000} value={entry.body}
            placeholder="A short description, or add highlights below."
            onChange={(event) => set({ body: event.target.value })}
          />
        </div>
      )}
      <Button
        type="button" variant="ghost" size="sm" className="cvs-add-bullet" disabled={bullets.length >= MAX_BULLETS}
        onClick={() => onSections((s) => addBullet(s, section.id, entry.id))}
      >
        <Plus size={14} /> Add highlight
      </Button>
    </article>
  )
}

function FreeformEntry({ section, entry, index, onSections }: {
  section: CvSection; entry: CvEntry; index: number; onSections: SectionsChange
}) {
  const uid = useId()
  const only = section.entries.length === 1
  const label = only ? `${section.title} text` : `${section.title} entry ${index + 1}`
  return (
    <div className="cvs-entry cvs-entry--freeform">
      {only ? (
        entry.evidence_item_id ? <span className="cvs-evidence-tag"><BadgeCheck size={13} aria-hidden="true" /> From your Evidence</span> : null
      ) : (
        <div className="cvs-entry__freeform-head">
          <label htmlFor={uid}>Entry {index + 1}</label>
          {entry.evidence_item_id ? <span className="cvs-evidence-tag"><BadgeCheck size={13} aria-hidden="true" /> From your Evidence</span> : null}
          <span className="cvs-entry__tools">
            <Button type="button" variant="ghost" size="icon-sm" aria-label={`Move ${label} up`} disabled={index === 0} onClick={() => onSections((s) => moveEntry(s, section.id, index, -1))}><ArrowUp /></Button>
            <Button type="button" variant="ghost" size="icon-sm" aria-label={`Move ${label} down`} disabled={index === section.entries.length - 1} onClick={() => onSections((s) => moveEntry(s, section.id, index, 1))}><ArrowDown /></Button>
            <Button type="button" variant="ghost" size="icon-sm" aria-label={`Delete ${label}`} onClick={() => onSections((s) => removeEntry(s, section.id, entry.id))}><Trash2 /></Button>
          </span>
        </div>
      )}
      <textarea
        id={uid} aria-label={label} className="cvs-textarea" rows={section.kind === 'summary' ? 4 : 2} maxLength={5000}
        value={entry.body} placeholder={FREEFORM_HINTS[section.kind] ?? 'Write this entry in your own words.'}
        onChange={(event) => onSections((s) => updateEntry(s, section.id, entry.id, { body: event.target.value }))}
      />
    </div>
  )
}

export function CvSectionEditor({ section, onSections }: { section: CvSection; onSections: SectionsChange }) {
  const uid = useId()
  const structured = isStructuredKind(section.kind)
  const addLabel = structured ? `Add ${FIELD_LABELS[section.kind]?.noun ?? 'entry'}` : 'Add entry'

  function remove() {
    if (section.entries.length > 0 && !window.confirm(`Remove the ${section.title} section and everything in it?`)) return
    onSections((sections) => removeSection(sections, section.id))
  }

  return (
    <section id={`cv-section-${section.id}`} className={cn('cvs-section', !section.visible && 'is-hidden')} aria-labelledby={`${uid}-kind`} tabIndex={-1}>
      <header className="cvs-section__head">
        <input
          className="cvs-section__title" aria-label={`Section name for ${sectionLabels[section.kind]}`} value={section.title} maxLength={120}
          onChange={(event) => onSections((sections) => sections.map((item) => item.id === section.id ? { ...item, title: event.target.value } : item))}
        />
        {!section.visible ? <span className="cvs-section__hidden">Hidden from your CV</span> : null}
        <span id={`${uid}-kind`} className={cn('cvs-section__kind', section.title.trim() === sectionLabels[section.kind] && 'sr-only')}>{sectionLabels[section.kind]}</span>
        <Button type="button" variant="ghost" size="icon-sm" className="cvs-section__remove" aria-label={`Remove ${section.title} section`} onClick={remove}><Trash2 /></Button>
      </header>
      <div className="cvs-section__entries">
        {section.entries.length === 0 ? <p className="cvs-section__empty">Nothing here yet.</p> : null}
        {section.entries.map((entry, index) => structured
          ? <StructuredEntry key={entry.id} section={section} entry={entry} index={index} onSections={onSections} />
          : <FreeformEntry key={entry.id} section={section} entry={entry} index={index} onSections={onSections} />)}
      </div>
      <Button type="button" variant="outline" size="sm" className="cvs-section__add" onClick={() => onSections((sections) => addEntry(sections, section.id))}>
        <Plus size={15} /> {addLabel}
      </Button>
    </section>
  )
}

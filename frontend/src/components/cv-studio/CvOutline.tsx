import { useState } from 'react'
import type { KeyboardEvent } from 'react'
import { ArrowDown, ArrowUp, Eye, EyeOff, GripVertical, Plus } from 'lucide-react'
import { Button } from '#/components/ui/button'
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuTrigger,
} from '#/components/ui/dropdown-menu'
import type { CvSection } from '#/lib/api/schemas'
import { sectionLabels } from '#/lib/cv-studio/editor'
import { cn } from '#/lib/utils'

const ADDABLE_KINDS: CvSection['kind'][] = [
  'summary', 'experience', 'education', 'skills', 'projects', 'achievements', 'certifications', 'interview-evidence', 'custom',
]

export function CvOutline({ sections, onMove, onMoveTo, onToggle, onAdd, onFocusSection }: {
  sections: CvSection[]
  onMove: (index: number, delta: -1 | 1) => void
  onMoveTo: (from: number, to: number) => void
  onToggle: (sectionId: string) => void
  onAdd: (kind: CvSection['kind']) => void
  onFocusSection: (sectionId: string) => void
}) {
  const [dragIndex, setDragIndex] = useState<number | null>(null)
  const [overIndex, setOverIndex] = useState<number | null>(null)
  const [announcement, setAnnouncement] = useState('')

  function move(index: number, delta: -1 | 1) {
    const target = index + delta
    if (target < 0 || target >= sections.length) return
    onMove(index, delta)
    setAnnouncement(`${sections[index].title} moved to position ${target + 1} of ${sections.length}.`)
  }

  function handleKey(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    if (event.key === 'ArrowUp') { event.preventDefault(); move(index, -1) }
    if (event.key === 'ArrowDown') { event.preventDefault(); move(index, 1) }
  }

  function finishDrag() { setDragIndex(null); setOverIndex(null) }

  return (
    <div className="cvs-outline">
      {sections.length === 0 ? (
        <p className="cvs-outline__empty">No sections yet. Add your first one below.</p>
      ) : (
        <ol className="cvs-outline__list" aria-label="Sections in your CV">
          {sections.map((section, index) => (
            <li
              key={section.id}
              className={cn(
                'cvs-outline__item',
                !section.visible && 'is-hidden',
                dragIndex === index && 'is-dragging',
                overIndex === index && dragIndex !== index && 'is-drop-target',
              )}
              draggable
              onDragStart={(event) => {
                setDragIndex(index)
                event.dataTransfer.effectAllowed = 'move'
                event.dataTransfer.setData('text/plain', section.id)
              }}
              onDragOver={(event) => { event.preventDefault(); if (overIndex !== index) setOverIndex(index) }}
              onDrop={(event) => {
                event.preventDefault()
                if (dragIndex !== null && dragIndex !== index) {
                  onMoveTo(dragIndex, index)
                  setAnnouncement(`${sections[dragIndex].title} moved to position ${index + 1} of ${sections.length}.`)
                }
                finishDrag()
              }}
              onDragEnd={finishDrag}
            >
              <button
                type="button"
                className="cvs-outline__grip"
                aria-label={`Reorder ${section.title}. Use the up and down arrow keys.`}
                onKeyDown={(event) => handleKey(event, index)}
              >
                <GripVertical size={15} aria-hidden="true" />
              </button>
              <button type="button" className="cvs-outline__name" onClick={() => onFocusSection(section.id)}>
                <span className="cvs-outline__title">{section.title}</span>
                <span className="cvs-outline__meta">
                  {section.visible ? `${section.entries.length} ${section.entries.length === 1 ? 'entry' : 'entries'}` : 'Hidden from CV'}
                </span>
              </button>
              <span className="cvs-outline__actions">
                <Button type="button" variant="ghost" size="icon-sm" aria-label={`Move ${section.title} up`} disabled={index === 0} onClick={() => move(index, -1)}><ArrowUp /></Button>
                <Button type="button" variant="ghost" size="icon-sm" aria-label={`Move ${section.title} down`} disabled={index === sections.length - 1} onClick={() => move(index, 1)}><ArrowDown /></Button>
                <Button
                  type="button" variant="ghost" size="icon-sm"
                  aria-label={`${section.visible ? 'Hide' : 'Show'} ${section.title}`}
                  onClick={() => onToggle(section.id)}
                >
                  {section.visible ? <Eye /> : <EyeOff />}
                </Button>
              </span>
            </li>
          ))}
        </ol>
      )}
      <p className="sr-only" role="status" aria-live="polite">{announcement}</p>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button type="button" variant="outline" className="cvs-outline__add"><Plus size={16} /> Add section</Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-56">
          <DropdownMenuLabel>Add a section</DropdownMenuLabel>
          {ADDABLE_KINDS.map((kind) => (
            <DropdownMenuItem key={kind} onSelect={() => onAdd(kind)}>{sectionLabels[kind]}</DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
}

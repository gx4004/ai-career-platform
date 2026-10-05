import { useState } from 'react'
import type { ReactNode } from 'react'
import { ArrowDown, ArrowUp, ChevronDown, ChevronRight, Eye, EyeOff, GripVertical, Plus } from 'lucide-react'
import {
  Button, DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuTrigger, EmptyState, Stack,
} from '#/components/kit'
import type { CvSection } from '#/lib/api/schemas'
import { sectionLabels } from '#/lib/cv-studio/editor'

const ADDABLE_KINDS: CvSection['kind'][] = [
  'summary', 'experience', 'education', 'skills', 'projects', 'achievements', 'certifications', 'interview-evidence', 'custom',
]

/**
 * Every section as a row, including hidden ones: open, reorder (drag the grip, or the up and down buttons),
 * show or hide, add. The open section unfolds in place: its row gets a lemon strip and `editor` below it.
 */
export function CvOutline({ sections, activeId, editor, onMove, onMoveTo, onToggle, onAdd, onOpen, onClose }: {
  sections: CvSection[]
  /** The section whose editor is unfolded, if any. */
  activeId?: string
  /** The editor of `activeId`, shown inside its row. */
  editor?: ReactNode
  onMove: (index: number, delta: -1 | 1) => void
  /** Drag and drop: move the section at `from` to `to`. */
  onMoveTo: (from: number, to: number) => void
  onToggle: (sectionId: string) => void
  onAdd: (kind: CvSection['kind']) => void
  onOpen: (sectionId: string) => void
  /** Fold the open section back into the list. */
  onClose: () => void
}) {
  const [announcement, setAnnouncement] = useState('')
  const [dragFrom, setDragFrom] = useState<number | null>(null)
  const [dragOver, setDragOver] = useState<number | null>(null)
  const nameOf = (section: CvSection) => section.title.trim() || sectionLabels[section.kind]

  function move(index: number, delta: -1 | 1) {
    onMove(index, delta)
    setAnnouncement(`${nameOf(sections[index])} moved to position ${index + delta + 1} of ${sections.length}.`)
  }

  function drop(to: number) {
    if (dragFrom !== null && dragFrom !== to) {
      onMoveTo(dragFrom, to)
      setAnnouncement(`${nameOf(sections[dragFrom])} moved to position ${to + 1} of ${sections.length}.`)
    }
    setDragFrom(null)
    setDragOver(null)
  }

  return (
    <Stack gap={3}>
      {sections.length === 0 ? (
        <EmptyState size="inline" title="No sections yet. Add your first one below." />
      ) : (
        <ul className="cvs-outline" role="list" aria-label="Sections in your CV">
          {sections.map((section, index) => {
            const name = nameOf(section)
            const open = section.id === activeId
            const count = section.visible
              ? `${section.entries.length} ${section.entries.length === 1 ? 'entry' : 'entries'}`
              : 'Hidden from CV'
            const toggle = (
              <Button
                type="button" iconOnly variant="ghost" size="sm"
                aria-label={`${section.visible ? 'Hide' : 'Show'} ${name}`}
                onClick={() => onToggle(section.id)}
              >
                {section.visible ? <Eye aria-hidden="true" /> : <EyeOff aria-hidden="true" />}
              </Button>
            )
            return (
              <li
                key={section.id} className="cvs-sec" data-open={open || undefined} data-hidden={!section.visible || undefined}
                data-dragging={dragFrom === index || undefined} data-over={dragOver === index && dragFrom !== index || undefined}
                draggable={!open}
                onDragStart={(event) => { setDragFrom(index); event.dataTransfer.effectAllowed = 'move'; event.dataTransfer.setData('text/plain', section.id) }}
                onDragOver={(event) => { if (dragFrom !== null) { event.preventDefault(); setDragOver(index) } }}
                onDrop={(event) => { event.preventDefault(); drop(index) }}
                onDragEnd={() => { setDragFrom(null); setDragOver(null) }}
              >
                <div className="cvs-sec__head">
                  <span className="cvs-sec__grip" aria-hidden="true"><GripVertical /></span>
                  <div className="cvs-sec__text">
                    {open
                      ? <span className="cvs-sec__name">{name}</span>
                      : <button type="button" className="cvs-sec__name cvs-sec__open" onClick={() => onOpen(section.id)}>{name}</button>}
                    <span className="cvs-sec__count">{count}</span>
                  </div>
                  <div className="cvs-sec__actions">
                    {open ? (
                      <Button type="button" iconOnly variant="ghost" size="sm" aria-label="All sections" aria-expanded="true" onClick={onClose}>
                        <ChevronDown aria-hidden="true" />
                      </Button>
                    ) : (
                      <>
                        <span className="cvs-sec__reveal">
                          <Button type="button" iconOnly variant="ghost" size="sm" aria-label={`Move ${name} up`} disabled={index === 0} onClick={() => move(index, -1)}><ArrowUp aria-hidden="true" /></Button>
                          <Button type="button" iconOnly variant="ghost" size="sm" aria-label={`Move ${name} down`} disabled={index === sections.length - 1} onClick={() => move(index, 1)}><ArrowDown aria-hidden="true" /></Button>
                          {section.visible ? toggle : null}
                        </span>
                        {section.visible ? null : toggle}
                        <span className="cvs-sec__chevron" aria-hidden="true"><ChevronRight /></span>
                      </>
                    )}
                  </div>
                </div>
                {open ? <div className="cvs-sec__editor">{editor}</div> : null}
              </li>
            )
          })}
        </ul>
      )}
      <p className="kit-sr-only" role="status" aria-live="polite">{announcement}</p>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button type="button" variant="secondary" className="cvs-add"><Plus aria-hidden="true" /> Add section</Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start">
          <DropdownMenuLabel>Add a section</DropdownMenuLabel>
          {ADDABLE_KINDS.map((kind) => (
            <DropdownMenuItem key={kind} onSelect={() => onAdd(kind)}>{sectionLabels[kind]}</DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    </Stack>
  )
}

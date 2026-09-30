import { useState } from 'react'
import { ArrowDown, ArrowUp, Eye, EyeOff, Plus } from 'lucide-react'
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

/** Every section, including hidden ones: open, reorder (up/down), show or hide, add. */
export function CvOutline({ sections, onMove, onToggle, onAdd, onOpen }: {
  sections: CvSection[]
  onMove: (index: number, delta: -1 | 1) => void
  onToggle: (sectionId: string) => void
  onAdd: (kind: CvSection['kind']) => void
  onOpen: (sectionId: string) => void
}) {
  const [announcement, setAnnouncement] = useState('')

  function move(index: number, delta: -1 | 1) {
    onMove(index, delta)
    setAnnouncement(`${sections[index].title} moved to position ${index + delta + 1} of ${sections.length}.`)
  }

  return (
    <div className="cvs-outline">
      {sections.length === 0 ? (
        <p className="cvs-muted">No sections yet. Add your first one below.</p>
      ) : (
        <ol className="cvs-outline__list" aria-label="Sections in your CV">
          {sections.map((section, index) => (
            <li key={section.id} className={cn('cvs-outline__item', !section.visible && 'is-hidden')}>
              <button type="button" className="cvs-outline__name" onClick={() => onOpen(section.id)}>
                <span className="cvs-outline__title">{section.title}</span>
                <span className="cvs-outline__meta">
                  {section.visible ? `${section.entries.length} ${section.entries.length === 1 ? 'entry' : 'entries'}` : 'Hidden from CV'}
                </span>
              </button>
              <Button type="button" variant="ghost" size="icon-sm" aria-label={`Move ${section.title} up`} disabled={index === 0} onClick={() => move(index, -1)}><ArrowUp /></Button>
              <Button type="button" variant="ghost" size="icon-sm" aria-label={`Move ${section.title} down`} disabled={index === sections.length - 1} onClick={() => move(index, 1)}><ArrowDown /></Button>
              <Button type="button" variant="ghost" size="icon-sm" aria-label={`${section.visible ? 'Hide' : 'Show'} ${section.title}`} onClick={() => onToggle(section.id)}>
                {section.visible ? <Eye /> : <EyeOff />}
              </Button>
            </li>
          ))}
        </ol>
      )}
      <p className="sr-only" role="status" aria-live="polite">{announcement}</p>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button type="button" variant="outline" className="cvs-dashed"><Plus size={16} /> Add section</Button>
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

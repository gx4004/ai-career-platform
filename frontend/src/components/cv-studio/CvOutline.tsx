import { useState } from 'react'
import { ArrowDown, ArrowUp, ChevronRight, Eye, EyeOff, Plus } from 'lucide-react'
import {
  Button, DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuTrigger, EmptyState,
  List, Row, RowActions, RowBody, RowReveal, RowSubtitle, RowTitle, Stack,
} from '#/components/kit'
import type { CvSection } from '#/lib/api/schemas'
import { sectionLabels } from '#/lib/cv-studio/editor'

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
  const nameOf = (section: CvSection) => section.title.trim() || sectionLabels[section.kind]

  function move(index: number, delta: -1 | 1) {
    onMove(index, delta)
    setAnnouncement(`${nameOf(sections[index])} moved to position ${index + delta + 1} of ${sections.length}.`)
  }

  return (
    <Stack gap={3}>
      {sections.length === 0 ? (
        <EmptyState size="inline" title="No sections yet. Add your first one below." />
      ) : (
        <List aria-label="Sections in your CV" className="cvs-outline">
          {sections.map((section, index) => {
            const name = nameOf(section)
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
              <Row key={section.id}>
                <RowBody>
                  <RowTitle asChild><button type="button" onClick={() => onOpen(section.id)}>{name}</button></RowTitle>
                  <RowSubtitle>
                    {section.visible ? `${section.entries.length} ${section.entries.length === 1 ? 'entry' : 'entries'}` : 'Hidden from CV'}
                  </RowSubtitle>
                </RowBody>
                <RowActions reveal={false}>
                  <RowReveal>
                    <Button type="button" iconOnly variant="ghost" size="sm" aria-label={`Move ${name} up`} disabled={index === 0} onClick={() => move(index, -1)}><ArrowUp aria-hidden="true" /></Button>
                    <Button type="button" iconOnly variant="ghost" size="sm" aria-label={`Move ${name} down`} disabled={index === sections.length - 1} onClick={() => move(index, 1)}><ArrowDown aria-hidden="true" /></Button>
                  </RowReveal>
                  {section.visible ? <RowReveal>{toggle}</RowReveal> : toggle}
                  <span className="cvs-row-chevron" aria-hidden="true"><ChevronRight /></span>
                </RowActions>
              </Row>
            )
          })}
        </List>
      )}
      <p className="kit-sr-only" role="status" aria-live="polite">{announcement}</p>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button type="button" variant="secondary" size="sm"><Plus aria-hidden="true" /> Add section</Button>
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

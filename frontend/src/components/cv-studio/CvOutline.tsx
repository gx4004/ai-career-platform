import { Fragment, useState } from 'react'
import type { ReactNode } from 'react'
import { ArrowDown, ArrowUp, ChevronDown, ChevronRight, Eye, EyeOff, GripVertical, Plus, UserRound } from 'lucide-react'
import {
  Button, DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuTrigger, EmptyState, List, Row, RowActions,
  RowBody, RowLeading, RowReveal, RowSubtitle, RowTitle, Stack,
} from '#/components/kit'
import type { CvHeader, CvSection } from '#/lib/api/schemas'
import { sectionLabels } from '#/lib/cv-studio/editor'
import { describeHeader } from '#/lib/cv-studio/header'

const ADDABLE_KINDS: CvSection['kind'][] = [
  'summary', 'experience', 'education', 'skills', 'projects', 'achievements', 'certifications', 'interview-evidence', 'custom',
]
/** Kinds an application system expects once: Add section stops offering them when the CV has one (shown or hidden). */
const SINGLE_KINDS: ReadonlySet<CvSection['kind']> = new Set(['summary', 'experience', 'education', 'skills'])

/**
 * Every section as a row, including hidden ones: open, reorder (drag the grip, or the up and down buttons),
 * show or hide, add. The open section unfolds in place: its row gets a lemon strip and `editor` below it.
 */
export function CvOutline({ sections, activeId, editor, header, documentName, headerOpen, headerEditor, onOpenHeader, onMove, onMoveTo, onToggle, onAdd, onOpen, onClose }: {
  sections: CvSection[]
  /** The section whose editor is unfolded, if any. */
  activeId?: string
  /** The editor of `activeId`, shown inside its row. */
  editor?: ReactNode
  /** The document header (name, headline, contact details): a row above the sections, with its own editor. */
  header?: CvHeader
  documentName?: string
  headerOpen?: boolean
  headerEditor?: ReactNode
  onOpenHeader?: () => void
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

  const headerRow = onOpenHeader ? (
    <>
      <Row className="cvs-sec" selected={headerOpen} interactive={!headerOpen} aria-current={headerOpen ? 'true' : undefined} data-testid="cv-header-row">
        <RowLeading className="cvs-sec__grip cvs-sec__grip--static" aria-hidden="true"><UserRound /></RowLeading>
        <RowBody>
          {headerOpen
            ? <RowTitle size="lg">Header</RowTitle>
            : <RowTitle size="lg" asChild><button type="button" onClick={onOpenHeader}>Header</button></RowTitle>}
          <RowSubtitle>{describeHeader(header, documentName ?? '')}</RowSubtitle>
        </RowBody>
        <RowActions reveal={false}>
          {headerOpen ? (
            <Button type="button" iconOnly variant="ghost" size="sm" aria-label="All sections" aria-expanded="true" onClick={onClose}>
              <ChevronDown aria-hidden="true" />
            </Button>
          ) : <ChevronRight className="cvs-sec__chevron" aria-hidden="true" />}
        </RowActions>
      </Row>
      {headerOpen ? <Row className="cvs-sec__editor">{headerEditor}</Row> : null}
    </>
  ) : null

  return (
    <Stack gap={3}>
      {sections.length === 0 && !headerRow ? (
        <EmptyState size="inline" title="No sections yet. Add your first one below." />
      ) : (
        <List framed={false} className="cvs-outline" aria-label="Sections in your CV">
          {headerRow}
          {sections.map((section, index) => {
            const name = nameOf(section)
            const open = section.id === activeId
            const count = section.visible
              ? `${section.entries.length} ${section.entries.length === 1 ? 'entry' : 'entries'}`
              // Short enough for the 320px sheet's second line: the eye-off control and dimmed name say the rest.
              : 'Hidden'
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
              <Fragment key={section.id}>
                <Row
                  className="cvs-sec" selected={open} interactive={!open} aria-current={open ? 'true' : undefined}
                  data-hidden={!section.visible || undefined}
                  data-dragging={dragFrom === index || undefined} data-over={dragOver === index && dragFrom !== index || undefined}
                  draggable={!open}
                  onDragStart={(event) => { setDragFrom(index); event.dataTransfer.effectAllowed = 'move'; event.dataTransfer.setData('text/plain', section.id) }}
                  onDragOver={(event) => { if (dragFrom !== null) { event.preventDefault(); setDragOver(index) } }}
                  onDrop={(event) => { event.preventDefault(); drop(index) }}
                  onDragEnd={() => { setDragFrom(null); setDragOver(null) }}
                >
                  <RowLeading className="cvs-sec__grip" aria-hidden="true"><GripVertical /></RowLeading>
                  <RowBody>
                    {open
                      ? <RowTitle size="lg">{name}</RowTitle>
                      : <RowTitle size="lg" asChild><button type="button" onClick={() => onOpen(section.id)}>{name}</button></RowTitle>}
                    <RowSubtitle>{count}</RowSubtitle>
                  </RowBody>
                  <RowActions reveal={false}>
                    {open ? (
                      <Button type="button" iconOnly variant="ghost" size="sm" aria-label="All sections" aria-expanded="true" onClick={onClose}>
                        <ChevronDown aria-hidden="true" />
                      </Button>
                    ) : (
                      <>
                        <RowReveal>
                          <Button type="button" iconOnly variant="ghost" size="sm" aria-label={`Move ${name} up`} disabled={index === 0} onClick={() => move(index, -1)}><ArrowUp aria-hidden="true" /></Button>
                          <Button type="button" iconOnly variant="ghost" size="sm" aria-label={`Move ${name} down`} disabled={index === sections.length - 1} onClick={() => move(index, 1)}><ArrowDown aria-hidden="true" /></Button>
                          {section.visible ? toggle : null}
                        </RowReveal>
                        {section.visible ? null : toggle}
                        <ChevronRight className="cvs-sec__chevron" aria-hidden="true" />
                      </>
                    )}
                  </RowActions>
                </Row>
                {open ? <Row className="cvs-sec__editor">{editor}</Row> : null}
              </Fragment>
            )
          })}
        </List>
      )}
      {sections.length === 0 && headerRow ? <EmptyState size="inline" title="No sections yet. Add your first one below." /> : null}
      <p className="kit-sr-only" role="status" aria-live="polite">{announcement}</p>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button type="button" variant="secondary" className="cvs-add"><Plus aria-hidden="true" /> Add section</Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start">
          <DropdownMenuLabel>Add a section</DropdownMenuLabel>
          {ADDABLE_KINDS.filter((kind) => !SINGLE_KINDS.has(kind) || !sections.some((section) => section.kind === kind)).map((kind) => (
            <DropdownMenuItem key={kind} onSelect={() => onAdd(kind)}>{sectionLabels[kind]}</DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    </Stack>
  )
}

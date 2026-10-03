import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { CSSProperties, KeyboardEvent } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Download } from 'lucide-react'
import {
  Button, Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, Notice, Skeleton,
} from '#/components/kit'
import { fetchCvArtifactBlob } from '#/lib/api/client'
import type { CvSection, CvStyle, CvStyleCatalog } from '#/lib/api/schemas'
import { buildPreviewSections, resolvePreviewStyle, splitTwoColumn } from '#/lib/cv-studio/preview'
import type { PreviewSection } from '#/lib/cv-studio/preview'

/** A4 at CSS reference resolution: 297mm tall. */
const PAGE_HEIGHT_PX = 297 * (96 / 25.4)

type EditTarget = { activeId?: string; onEdit?: (sectionId: string) => void }

/** A section on the paper. With `onEdit` it is the way into its editor: click, Enter or Space. */
function PaperSection({ section, activeId, onEdit }: { section: PreviewSection } & EditTarget) {
  const editable = onEdit ? {
    role: 'button', tabIndex: 0, 'aria-label': `Edit ${section.title || 'section'}`, 'aria-pressed': activeId === section.id,
    onClick: () => onEdit(section.id),
    onKeyDown: (event: KeyboardEvent<HTMLElement>) => {
      if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); onEdit(section.id) }
    },
  } : {}
  const Tag = onEdit ? 'div' : 'section'
  return (
    <Tag className={`cvp-section${onEdit ? ' cvp-section--editable' : ''}`} data-section-id={section.id} {...editable}>
      <h3 className="cvp-section__title">{section.title}</h3>
      {section.entries.map((entry) => (
        <div className="cvp-entry" key={entry.id}>
          {entry.heading ? (
            <div className="cvp-entry__row">
              <p className="cvp-entry__heading">
                <b>{entry.heading}</b>{entry.subheading ? ` — ${entry.subheading}` : null}
              </p>
              {entry.dates ? <p className="cvp-entry__dates">{entry.dates}</p> : null}
            </div>
          ) : null}
          {entry.location ? <p className="cvp-entry__meta">{entry.location}</p> : null}
          {entry.bullets.length > 0 ? (
            <ul className="cvp-entry__bullets">
              {entry.bullets.map((bullet, index) => <li key={`${entry.id}-${index}`}>{bullet}</li>)}
            </ul>
          ) : null}
          {entry.text ? <p className="cvp-entry__text">{entry.text}</p> : null}
        </div>
      ))}
    </Tag>
  )
}

/**
 * Live HTML rendering of the unsaved draft, scaled to fit its column (never
 * above 100%), using the design values from the backend style catalog; the
 * exported PDF remains the source of truth. Each section is a way into its editor.
 */
export function CvPaper({ name, sections, style, catalog, activeId, onEdit }: {
  name: string; sections: CvSection[]; style: CvStyle; catalog: CvStyleCatalog
} & EditTarget) {
  const frameRef = useRef<HTMLDivElement>(null)
  const paperRef = useRef<HTMLDivElement>(null)
  const [scale, setScale] = useState(1)
  const [paperHeight, setPaperHeight] = useState(PAGE_HEIGHT_PX)
  const effective = resolvePreviewStyle(style, catalog)
  const twoColumn = effective.sidebarKinds.length > 0
  const preview = buildPreviewSections(sections)
  const hasContent = preview.some((section) => section.entries.length > 0)

  useLayoutEffect(() => {
    const frame = frameRef.current
    const paper = paperRef.current
    if (!frame || !paper || typeof ResizeObserver === 'undefined') return
    const measure = () => {
      const width = paper.offsetWidth
      if (width > 0) setScale(Math.min(1, frame.clientWidth / width))
      setPaperHeight(Math.max(PAGE_HEIGHT_PX, paper.offsetHeight))
    }
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(frame)
    observer.observe(paper)
    return () => observer.disconnect()
  }, [])

  const paperStyle = {
    '--cvp-font': effective.fontStack,
    '--cvp-accent': effective.accent,
    '--cvp-body': `${effective.bodyPt}pt`,
    '--cvp-heading': `${effective.headingPt}pt`,
    '--cvp-margin': `${effective.marginMm}mm`,
    '--cvp-gap': `${effective.sectionGapPt}pt`,
    transform: `scale(${scale})`,
  } as CSSProperties
  const title = <h2 className="cvp-title" style={{ textAlign: effective.titleAlign }}>{name.trim() || 'Untitled CV'}</h2>
  const pages = Math.max(1, Math.ceil((paperHeight - 1) / PAGE_HEIGHT_PX))
  const { side, main } = splitTwoColumn(preview, effective.sidebarKinds)

  return (
    <div className="cvp">
      <div ref={frameRef} className="cvp-frame" style={{ height: paperHeight * scale }}>
        <div
          ref={paperRef}
          className={`cvp-paper cvp-paper--${effective.layout}${twoColumn ? ' cvp-paper--two-column' : ''}`}
          style={paperStyle}
          data-testid="cv-paper"
          aria-label="Live preview of your CV"
          role="document"
        >
          {twoColumn ? (
            <div className="cvp-columns">
              <div className="cvp-side">{title}{side.map((section) => <PaperSection key={section.id} section={section} activeId={activeId} onEdit={onEdit} />)}</div>
              <div className="cvp-main">{main.map((section) => <PaperSection key={section.id} section={section} activeId={activeId} onEdit={onEdit} />)}</div>
            </div>
          ) : (
            <>{title}{preview.map((section) => <PaperSection key={section.id} section={section} activeId={activeId} onEdit={onEdit} />)}</>
          )}
          {!hasContent ? <p className="cvp-placeholder">Your CV appears here as you write.</p> : null}
        </div>
      </div>
      <p className="cvp-footnote">{pages === 1 ? '1 page' : `About ${pages} pages`}</p>
    </div>
  )
}

function useObjectUrl(blob: Blob | undefined) {
  const [url, setUrl] = useState('')
  useEffect(() => {
    if (!blob) { setUrl(''); return }
    const next = URL.createObjectURL(blob)
    setUrl(next)
    return () => URL.revokeObjectURL(next)
  }, [blob])
  return url
}

/** The server-rendered PDF: exactly what "Export PDF" downloads. */
export function ExactPdfDialog({ open, onOpenChange, documentId, documentName, revision, style, templateName }: {
  open: boolean; onOpenChange: (open: boolean) => void; documentId: string; documentName: string; revision: string
  style: CvStyle; templateName: string
}) {
  const pdf = useQuery({
    queryKey: ['cv-artifact', documentId, revision, JSON.stringify(style), 'pdf'],
    queryFn: () => fetchCvArtifactBlob(documentId, 'pdf'),
    enabled: open,
    staleTime: Infinity,
  })
  const url = useObjectUrl(pdf.data)
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="lg">
        <DialogHeader>
          <DialogTitle>Exact PDF</DialogTitle>
          <DialogDescription>This is the file you download with Export PDF, rendered on our server.</DialogDescription>
        </DialogHeader>
        <DialogBody>
          {pdf.isError ? (
            <Notice tone="danger" action={<Button type="button" size="sm" variant="secondary" onClick={() => void pdf.refetch()}>Try again</Button>}>
              We couldn’t build the PDF just now. Your CV is safe.
            </Notice>
          ) : !url ? (
            <div role="status">
              <Skeleton variant="block" width="100%" height="min(60dvh, 44rem)" />
              <span className="kit-sr-only">Building your PDF…</span>
            </div>
          ) : (
            <iframe className="cvs-pdf-frame" title={`${templateName} PDF preview`} src={`${url}#toolbar=0&navpanes=0&view=FitH`} />
          )}
        </DialogBody>
        {pdf.isError ? null : (
          <DialogFooter>
            <Button asChild disabled={!url}>
              <a href={url || undefined} download={`${documentName.trim() || 'cv'}.pdf`}><Download aria-hidden="true" /> Download PDF</a>
            </Button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  )
}

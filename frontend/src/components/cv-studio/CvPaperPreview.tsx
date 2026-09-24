import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Download, FileSearch } from 'lucide-react'
import { Button } from '#/components/ui/button'
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from '#/components/ui/dialog'
import { fetchCvArtifactBlob } from '#/lib/api/client'
import type { CvSection, CvStyle } from '#/lib/api/schemas'
import { buildPreviewSections, resolvePreviewStyle, splitTwoColumn } from '#/lib/cv-studio/preview'
import type { PreviewSection } from '#/lib/cv-studio/preview'
import { TEMPLATE_NAMES } from '#/lib/cv-studio/catalog'

/** A4 at CSS reference resolution: 297mm tall. */
const PAGE_HEIGHT_PX = 297 * (96 / 25.4)

function PaperSection({ section }: { section: PreviewSection }) {
  return (
    <section className="cvp-section">
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
    </section>
  )
}

/**
 * Live HTML rendering of the unsaved draft, scaled to fit its column. It mirrors
 * the server renderer's tokens closely; the exported PDF remains the source of truth.
 */
export function CvPaper({ name, sections, style }: { name: string; sections: CvSection[]; style: CvStyle }) {
  const frameRef = useRef<HTMLDivElement>(null)
  const paperRef = useRef<HTMLDivElement>(null)
  const [scale, setScale] = useState(1)
  const [paperHeight, setPaperHeight] = useState(PAGE_HEIGHT_PX)
  const effective = resolvePreviewStyle(style)
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
  const { side, main } = splitTwoColumn(preview)

  return (
    <div className="cvp">
      <div ref={frameRef} className="cvp-frame" style={{ height: paperHeight * scale }}>
        <div
          ref={paperRef}
          className={`cvp-paper cvp-paper--${effective.layout}${effective.twoColumn ? ' cvp-paper--two-column' : ''}`}
          style={paperStyle}
          data-testid="cv-paper"
          aria-label="Live preview of your CV"
          role="document"
        >
          {effective.twoColumn ? (
            <div className="cvp-columns">
              <div className="cvp-side">{title}{side.map((section) => <PaperSection key={section.id} section={section} />)}</div>
              <div className="cvp-main">{main.map((section) => <PaperSection key={section.id} section={section} />)}</div>
            </div>
          ) : (
            <>{title}{preview.map((section) => <PaperSection key={section.id} section={section} />)}</>
          )}
          {!hasContent ? <p className="cvp-placeholder">Your CV appears here as you write.</p> : null}
        </div>
      </div>
      <p className="cvp-footnote">{pages === 1 ? '1 page' : `About ${pages} pages`} · live preview</p>
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
export function ExactPdfDialog({ open, onOpenChange, documentId, documentName, revision, style }: {
  open: boolean; onOpenChange: (open: boolean) => void; documentId: string; documentName: string; revision: string; style: CvStyle
}) {
  const template = style.template_id
  const pdf = useQuery({
    queryKey: ['cv-artifact', documentId, revision, template, JSON.stringify(style), 'pdf'],
    queryFn: () => fetchCvArtifactBlob(documentId, template, 'pdf'),
    enabled: open,
    staleTime: Infinity,
  })
  const url = useObjectUrl(pdf.data)
  const templateName = TEMPLATE_NAMES[template]
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="cvs-pdf-dialog sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>Exact PDF</DialogTitle>
          <DialogDescription>This is the file you download with Export PDF, rendered on our server.</DialogDescription>
        </DialogHeader>
        {pdf.isError ? (
          <div className="cvs-inline-alert" role="alert">
            <p>We couldn’t build the PDF just now. Your CV is safe.</p>
            <Button type="button" size="sm" variant="outline" onClick={() => void pdf.refetch()}>Try again</Button>
          </div>
        ) : !url ? (
          <div className="cvs-pdf-loading" role="status"><FileSearch size={20} aria-hidden="true" /> Building your PDF…</div>
        ) : (
          <>
            <iframe className="cvs-pdf-frame" title={`${templateName} PDF preview`} src={`${url}#toolbar=0&navpanes=0&view=FitH`} />
            <div className="cvs-pdf-actions">
              <Button asChild>
                <a href={url} download={`${documentName.trim() || 'cv'}.pdf`}><Download size={16} /> Download PDF</a>
              </Button>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}

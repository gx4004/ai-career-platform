import type { ReactNode } from 'react'
import { ExternalLink, MousePointer2, ZoomIn, ZoomOut } from 'lucide-react'
import { Button, Sticker } from '#/components/kit'
import { useCoarsePointer } from '#/hooks/use-coarse-pointer'

/**
 * The desk the paper lies on: a grey stage with the hint sticker, the way to the exact PDF, and
 * the paper (which stays the template's own document, untouched). On phones the paper can be read
 * at a larger size and panned sideways instead of being shrunk to the width of the screen.
 */
export function CvDesk({ children, phone, zoom, onZoomChange, pdfDisabled, onViewPdf }: {
  children: ReactNode
  phone: boolean
  zoom: 'fit' | 'read'
  onZoomChange: (zoom: 'fit' | 'read') => void
  pdfDisabled: boolean
  onViewPdf: () => void
}) {
  // The verb follows the pointer: a 1024px window with a mouse clicks, a phone or tablet taps.
  const touch = useCoarsePointer()
  return (
    <section className="cvs-desk" aria-label="Live preview" data-zoom={phone ? zoom : 'fit'}>
      <div className="cvs-desk__top">
        <Sticker size="sm" tone="lemon" tilt={-2} className="cvs-desk__hint">
          <MousePointer2 aria-hidden="true" />{touch ? 'Tap a section to edit' : 'Click a section to edit'}
        </Sticker>
        <div className="cvs-desk__actions">
          {phone ? (
            <Button
              type="button" variant="ghost" size="sm" aria-pressed={zoom === 'read'}
              onClick={() => onZoomChange(zoom === 'read' ? 'fit' : 'read')}
            >
              {zoom === 'read' ? <ZoomOut aria-hidden="true" /> : <ZoomIn aria-hidden="true" />}{zoom === 'read' ? 'Fit page' : 'Read larger'}
            </Button>
          ) : null}
          <Button type="button" variant="link" disabled={pdfDisabled} onClick={onViewPdf}>
            View exact PDF <ExternalLink aria-hidden="true" />
          </Button>
        </div>
      </div>
      <div className="cvs-desk__page">{children}</div>
    </section>
  )
}

import { Download, RotateCcw } from 'lucide-react'
import {
  Button, Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, MetaRow, Notice,
} from '#/components/kit'
import type { CvSection, CvStyle, CvStyleCatalog, CvVariant } from '#/lib/api/schemas'
import { CvPaper } from './CvPaperPreview'
import { describeDiff, diffVersion } from './versionDiff'
import type { VersionExport } from './CvVersionsPanel'

const dateFormat = new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short', year: 'numeric' })

/** A saved version on its paper, read only, in the CV's current style: look before you restore or send it. */
export function CvVersionPreviewDialog({ variant, documentName, style, catalog, currentSections, exporting, canRestore, error, onOpenChange, onExport, onRestore }: {
  /** Open while set. */
  variant: CvVariant | null
  documentName: string
  style: CvStyle
  catalog: CvStyleCatalog
  currentSections: CvSection[]
  exporting: VersionExport
  canRestore: boolean
  /** The last action error (a version file that could not be built), shown here because the page is behind the dialog. */
  error: string
  onOpenChange: (open: boolean) => void
  /** Absent while the server cannot build a saved version as a file: the export buttons are then not shown. */
  onExport?: (variant: CvVariant, format: 'pdf' | 'docx') => void
  onRestore: (variant: CvVariant) => void
}) {
  const building = (format: 'pdf' | 'docx') => Boolean(variant && exporting?.variantId === variant.id && exporting.format === format)
  return (
    <Dialog open={variant !== null} onOpenChange={onOpenChange}>
      <DialogContent size="lg">
        <DialogHeader>
          <DialogTitle>{variant ? `Preview: ${variant.name}` : 'Preview'}</DialogTitle>
          <DialogDescription asChild>
            <div>
              {variant ? (
                <>
                  <MetaRow>
                    {dateFormat.format(new Date(variant.created_at))}
                    {variant.target_role ? `for ${variant.target_role}` : null}
                  </MetaRow>
                  <span>{describeDiff(diffVersion(variant.sections, currentSections))}. Your CV changes only if you use this version.</span>
                </>
              ) : null}
            </div>
          </DialogDescription>
        </DialogHeader>
        <DialogBody>
          {error ? <Notice tone="danger" className="cvs-preview__error">{error}</Notice> : null}
          {variant ? (
            <div className="cvs-preview">
              <CvPaper name={documentName} sections={variant.sections} style={style} catalog={catalog} />
            </div>
          ) : null}
        </DialogBody>
        <DialogFooter>
          <Button type="button" variant="secondary" disabled={!canRestore} onClick={() => variant && onRestore(variant)}>
            <RotateCcw aria-hidden="true" /> Use as my CV
          </Button>
          {onExport ? (
            <>
              <Button type="button" variant="secondary" loading={building('docx')} onClick={() => variant && onExport(variant, 'docx')}>
                <Download aria-hidden="true" /> DOCX
              </Button>
              <Button type="button" loading={building('pdf')} onClick={() => variant && onExport(variant, 'pdf')}>
                <Download aria-hidden="true" /> PDF
              </Button>
            </>
          ) : null}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

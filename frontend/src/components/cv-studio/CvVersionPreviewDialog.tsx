import { Download, RotateCcw } from 'lucide-react'
import {
  Button, Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, MetaRow, Notice,
} from '#/components/kit'
import { useBreakpoint } from '#/hooks/use-breakpoint'
import type { CvHeader, CvSection, CvStyle, CvVariant } from '#/lib/api/schemas'
import { EMPTY_HEADER } from '#/lib/cv-studio/header'
import { CvPagePreview } from './CvPagePreview'
import { describeDiff, diffVersion } from './versionDiff'
import type { VersionExport } from './CvVersionsPanel'

const dateFormat = new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short', year: 'numeric' })

/** A saved version on its paper, read only, in the CV's current style: look before you restore or send it. */
export function CvVersionPreviewDialog({ variant, documentId, documentName, header, style, currentSections, exporting, canRestore, error, onOpenChange, onExport, onRestore }: {
  /** Open while set. */
  variant: CvVariant | null
  documentId: string
  documentName: string
  /** The document's header: a saved version holds sections only, and its exports carry the current header. */
  header?: CvHeader
  style: CvStyle
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
  /**
   * On a phone the preview is the point of the dialog (cv-studio-G13): the description is the date and the one rule,
   * and PDF and DOCX share one Export menu (as on the version's card), so the footer holds two buttons, not three.
   * They stack (the kit's phone footer): side by side, "Use as my CV" and "Export" need 295px and a 320 screen's
   * dialog footer has 240.
   */
  const phone = useBreakpoint() === 'mobile'
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
                  <span>{phone ? '' : `${describeDiff(diffVersion(variant.sections, currentSections))}. `}Your CV changes only if you use this version.</span>
                </>
              ) : null}
            </div>
          </DialogDescription>
        </DialogHeader>
        <DialogBody>
          {error ? <Notice tone="danger" className="cvs-preview__error">{error}</Notice> : null}
          {variant ? (
            <div className="cvs-preview">
              <CvPagePreview
                documentId={documentId} draft={{ name: documentName, header: header ?? EMPTY_HEADER, sections: variant.sections, style }}
                label={`Preview of ${variant.name}`}
              />
            </div>
          ) : null}
        </DialogBody>
        <DialogFooter>
          <Button type="button" variant="secondary" disabled={!canRestore} onClick={() => variant && onRestore(variant)}>
            <RotateCcw aria-hidden="true" /> Use as my CV
          </Button>
          {onExport && phone ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button type="button" loading={building('pdf') || building('docx')}>
                  <Download aria-hidden="true" /> Export
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onSelect={() => variant && onExport(variant, 'pdf')}>PDF</DropdownMenuItem>
                <DropdownMenuItem onSelect={() => variant && onExport(variant, 'docx')}>DOCX</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          ) : onExport ? (
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

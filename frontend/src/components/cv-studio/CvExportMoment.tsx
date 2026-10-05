import { useEffect, useRef } from 'react'
import { Download, X } from 'lucide-react'
import { Button, ScoreSeal, Sticker } from '#/components/kit'

export type ExportMoment = {
  id: number
  format: 'pdf' | 'docx'
  filename: string
  /** Pages in the exported PDF, read from the file itself; null when it could not be read. */
  pages: number | null
  /** ATS checks that pass / were run, from the last check of this CV; null while there is no result. */
  checks: { passing: number; total: number } | null
}

const DISMISS_MS = 12_000

/** The number of pages in a PDF, from its page objects. Null if the file is not readable as one. */
export async function countPdfPages(blob: Blob): Promise<number | null> {
  try {
    const found = (await blob.text()).match(/\/Type\s*\/Page(?![A-Za-z])/g)
    return found && found.length > 0 ? found.length : null
  } catch {
    return null
  }
}

/**
 * "Your CV is ready": the moment an export finishes. A sticker with the page-count seal stamping in,
 * the file name, what the ATS check says, and the other format one click away. It leaves by itself.
 */
export function CvExportMoment({ moment, otherBusy, raised, onDownloadOther, onClose }: {
  moment: ExportMoment
  /** A dialog is open: sit at the top of the screen instead of over its buttons. */
  raised?: boolean
  otherBusy: boolean
  onDownloadOther: () => void
  onClose: () => void
}) {
  const close = useRef(onClose)
  close.current = onClose
  useEffect(() => {
    const timer = window.setTimeout(() => close.current(), DISMISS_MS)
    return () => window.clearTimeout(timer)
  }, [moment.id])

  const label = moment.format.toUpperCase()
  const facts = [
    moment.pages ? `${moment.pages} ${moment.pages === 1 ? 'page' : 'pages'}` : null,
    moment.checks ? (moment.checks.passing === moment.checks.total ? `All ${moment.checks.total} ATS checks pass` : `${moment.checks.passing} of ${moment.checks.total} ATS checks pass`) : null,
  ].filter(Boolean)

  return (
    <div className="cvs-moment" data-raised={raised || undefined} role="status" aria-live="polite" data-testid="export-moment">
      <Sticker tone="white" tilt={-1.5} className="cvs-moment__card">
        <ScoreSeal
          key={moment.id} className="cvs-moment__seal" tone="mint" size={96} unit={null} reveal="stamp" rotate={-6}
          value={moment.format === 'pdf' && moment.pages ? moment.pages : label} label={moment.format === 'pdf' && moment.pages ? 'Pages' : 'Format'}
        />
        <div className="cvs-moment__text">
          <p className="cvs-moment__title">Your {label} is ready</p>
          <p className="cvs-moment__file">{moment.filename}</p>
          {facts.length > 0 ? <p className="cvs-moment__facts">{facts.join(' · ')}</p> : null}
          <div className="cvs-moment__actions">
            <Button type="button" size="sm" variant="secondary" loading={otherBusy} onClick={onDownloadOther}>
              <Download aria-hidden="true" /> Download {moment.format === 'pdf' ? 'DOCX' : 'PDF'}
            </Button>
          </div>
        </div>
        <Button type="button" iconOnly size="sm" variant="ghost" aria-label="Dismiss" className="cvs-moment__close" onClick={onClose}>
          <X aria-hidden="true" />
        </Button>
      </Sticker>
    </div>
  )
}

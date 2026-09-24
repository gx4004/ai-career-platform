import { useEffect, useId, useRef, useState } from 'react'
import { FileUp, TriangleAlert } from 'lucide-react'
import { Button } from '#/components/ui/button'
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '#/components/ui/dialog'
import { acceptCvImport, proposeCvImport } from '#/lib/api/client'
import type { CvDocument, CvImportProposal } from '#/lib/api/schemas'

export function CvImportDialog({ open, onOpenChange, onImported }: {
  open: boolean; onOpenChange: (open: boolean) => void; onImported: (document: CvDocument) => void
}) {
  const fileId = useId()
  const nameId = useId()
  const inputRef = useRef<HTMLInputElement>(null)
  const [proposal, setProposal] = useState<CvImportProposal | null>(null)
  const [name, setName] = useState('')
  const [state, setState] = useState<'idle' | 'reading' | 'creating'>('idle')
  const [error, setError] = useState('')

  useEffect(() => {
    if (!open) return
    setProposal(null); setName(''); setError(''); setState('idle')
  }, [open])

  async function read(file: File | undefined) {
    if (!file) return
    setState('reading'); setError('')
    try {
      const next = await proposeCvImport(file)
      setProposal(next)
      setName(next.name)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'We couldn’t read that file.')
    } finally {
      setState('idle')
      if (inputRef.current) inputRef.current.value = ''
    }
  }

  async function create() {
    if (!proposal || !name.trim()) return
    setState('creating'); setError('')
    try {
      const document = await acceptCvImport({ ...proposal, name: name.trim() })
      onImported(document)
      onOpenChange(false)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'We couldn’t create your CV.')
    } finally {
      setState('idle')
    }
  }

  const entryCount = proposal?.sections.reduce((total, section) => total + section.entries.length, 0) ?? 0

  return (
    <Dialog open={open} onOpenChange={(next) => state === 'idle' && onOpenChange(next)}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Import your CV</DialogTitle>
          <DialogDescription>Upload a PDF or Word file. We’ll split it into sections you can edit, and nothing is saved until you say so.</DialogDescription>
        </DialogHeader>

        {!proposal ? (
          <label htmlFor={fileId} className="cvs-dropzone" data-busy={state === 'reading' || undefined}>
            <span className="cvs-dropzone__icon" aria-hidden="true"><FileUp size={22} /></span>
            <span className="cvs-dropzone__title">{state === 'reading' ? 'Reading your CV…' : 'Choose a PDF or DOCX'}</span>
            <span className="cvs-dropzone__hint">Up to 10 MB</span>
            <input
              ref={inputRef} id={fileId} type="file" className="sr-only" disabled={state !== 'idle'}
              accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
              onChange={(event) => void read(event.target.files?.[0])}
            />
          </label>
        ) : (
          <div className="cvs-import-review">
            <div className="cvs-field">
              <label htmlFor={nameId}>CV name</label>
              <input id={nameId} className="cvs-input" value={name} maxLength={120} onChange={(event) => setName(event.target.value)} />
            </div>
            <p className="cvs-import-review__summary">
              We found {proposal.sections.length} {proposal.sections.length === 1 ? 'section' : 'sections'} and {entryCount} {entryCount === 1 ? 'entry' : 'entries'} in {proposal.filename}.
            </p>
            <ul className="cvs-import-review__sections">
              {proposal.sections.map((section) => (
                <li key={section.id}><span>{section.title}</span><span>{section.entries.length}</span></li>
              ))}
            </ul>
            {proposal.warnings.map((warning) => (
              <p key={warning} className="cvs-import-review__warning"><TriangleAlert size={14} aria-hidden="true" /> {warning}</p>
            ))}
            <p className="cvs-import-review__note">Facts we spot, like achievements and skills, are also added to your Evidence for you to confirm later.</p>
          </div>
        )}

        {error ? <p role="alert" className="cvs-inline-error">{error}</p> : null}

        <DialogFooter>
          <Button type="button" variant="outline" disabled={state !== 'idle'} onClick={() => proposal ? setProposal(null) : onOpenChange(false)}>
            {proposal ? 'Choose another file' : 'Cancel'}
          </Button>
          {proposal ? (
            <Button type="button" loading={state === 'creating'} disabled={!name.trim() || proposal.sections.length === 0} onClick={() => void create()}>
              Create my CV
            </Button>
          ) : null}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

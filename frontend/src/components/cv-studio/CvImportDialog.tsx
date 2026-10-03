import { useEffect, useState } from 'react'
import {
  Button, Count, Dialog, DialogBody, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
  Field, FileInput, Input, List, Notice, Row, RowBody, RowMeta, RowTitle, Skeleton, Stack,
} from '#/components/kit'
import { acceptCvImport, proposeCvImport } from '#/lib/api/client'
import type { CvDocument, CvImportProposal } from '#/lib/api/schemas'

export function CvImportDialog({ open, onOpenChange, onImported, onCloseAutoFocus }: {
  open: boolean; onOpenChange: (open: boolean) => void; onImported: (document: CvDocument) => void
  /** Where focus goes on close, when the control that opened the dialog is gone (a menu item). */
  onCloseAutoFocus?: (event: Event) => void
}) {
  const [proposal, setProposal] = useState<CvImportProposal | null>(null)
  const [name, setName] = useState('')
  const [state, setState] = useState<'idle' | 'reading' | 'creating'>('idle')
  const [error, setError] = useState('')
  const [fileName, setFileName] = useState('')
  // FileInput cannot be reset from outside; a new key starts it empty again after a failed read.
  const [pickerKey, setPickerKey] = useState(0)

  useEffect(() => {
    if (!open) return
    setProposal(null); setName(''); setError(''); setState('idle')
  }, [open])

  async function read(file: File | undefined) {
    if (!file) return
    setState('reading'); setError(''); setFileName(file.name)
    try {
      const next = await proposeCvImport(file)
      setProposal(next)
      setName(next.name)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'We couldn’t read that file.')
    } finally {
      setState('idle')
      setPickerKey((key) => key + 1)
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
  const busy = state !== 'idle'

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent dismissible={!busy} onCloseAutoFocus={onCloseAutoFocus}>
        <DialogHeader>
          <DialogTitle>Import your CV</DialogTitle>
          <DialogDescription>
            {proposal
              ? `We found ${proposal.sections.length} ${proposal.sections.length === 1 ? 'section' : 'sections'} and ${entryCount} ${entryCount === 1 ? 'entry' : 'entries'} in ${proposal.filename}.`
              : 'Upload a PDF or Word file. We’ll split it into sections you can edit, and nothing is saved until you say so.'}
          </DialogDescription>
        </DialogHeader>

        <DialogBody className="cvs-import__body">
          <Stack gap={4}>
            {!proposal ? (
              state === 'reading' ? (
                <Stack gap={3}>
                  <p className="cvs-hint" role="status">Reading {fileName}…</p>
                  <List aria-label="Reading your CV" aria-busy="true"><Skeleton variant="row" as="li" density="compact" count={4} /></List>
                </Stack>
              ) : (
                <FileInput
                  key={pickerKey}
                  variant="dropzone"
                  label="Choose a PDF or DOCX"
                  hint="Up to 10 MB"
                  accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                  onFilesChange={([file]) => void read(file)}
                />
              )
            ) : (
              <>
                <Field label="CV name">
                  <Input value={name} maxLength={120} onChange={(event) => setName(event.target.value)} />
                </Field>
                <List boxed aria-label="Sections found">
                  {proposal.sections.map((section) => (
                    <Row key={section.id} density="compact">
                      <RowBody><RowTitle>{section.title}</RowTitle></RowBody>
                      <RowMeta><Count value={section.entries.length} /></RowMeta>
                    </Row>
                  ))}
                </List>
                {proposal.warnings.map((warning) => (
                  <Notice key={warning} tone="warning">{warning}</Notice>
                ))}
                <p className="cvs-hint">Facts we spot, like achievements and skills, are also added to your Evidence for you to confirm later.</p>
              </>
            )}

            {error ? <Notice tone="danger">{error}</Notice> : null}
          </Stack>
        </DialogBody>

        <DialogFooter>
          {proposal ? (
            <Button type="button" variant="secondary" disabled={busy} onClick={() => setProposal(null)}>Choose another file</Button>
          ) : (
            <DialogClose asChild><Button type="button" variant="secondary" disabled={busy}>Cancel</Button></DialogClose>
          )}
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

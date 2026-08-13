import { useEffect, useId, useState } from 'react'
import type { FormEvent } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Button } from '#/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '#/components/ui/dialog'
import { Input } from '#/components/ui/input'
import { Label } from '#/components/ui/label'
import { createCvDocument, listEvidenceItems } from '#/lib/api/client'
import type { CvDocument, EvidenceItem } from '#/lib/api/schemas'
import { EVIDENCE_QUERY_KEY, KIND_LABELS, contentEntries } from '#/lib/profile/evidence'

function evidenceSummary(item: EvidenceItem) {
  const content = contentEntries(item.content)
    .map(({ value }) => value)
    .filter(Boolean)
    .join(' · ')
  return content || 'Confirmed evidence item'
}

export function CreateCvDocumentDialog({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  onCreated: (document: CvDocument) => void
}) {
  const nameId = useId()
  const [name, setName] = useState('My CV')
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const evidenceQuery = useQuery({
    queryKey: EVIDENCE_QUERY_KEY,
    queryFn: async () => (await listEvidenceItems()).items,
    enabled: open,
  })
  const confirmedItems = (evidenceQuery.data ?? []).filter(
    (item) => item.confirmation_state === 'confirmed',
  )

  useEffect(() => {
    if (!open) return
    setName('My CV')
    setSelectedIds([])
    setError('')
  }, [open])

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (submitting) return
    setSubmitting(true)
    setError('')
    try {
      const created = await createCvDocument({
        name: name.trim(),
        seed_evidence_item_ids: selectedIds,
      })
      onCreated(created)
      onOpenChange(false)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not create the CV document.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !submitting && onOpenChange(next)}>
      <DialogContent showCloseButton={!submitting}>
        <form className="grid gap-4" onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>Create a CV document</DialogTitle>
            <DialogDescription>
              Start blank or include facts you have already confirmed. Every selected fact stays
              linked to your evidence profile.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-2">
            <Label htmlFor={nameId}>Document name</Label>
            <Input
              id={nameId}
              value={name}
              maxLength={120}
              required
              autoFocus
              disabled={submitting}
              onChange={(event) => setName(event.target.value)}
            />
          </div>

          <fieldset className="grid max-h-64 gap-2 overflow-y-auto rounded-[var(--radius-lg)] border border-border/70 p-3">
            <legend className="px-1 text-sm font-medium">Confirmed evidence (optional)</legend>
            {evidenceQuery.isLoading ? (
              <p className="small-copy muted-copy" role="status">Loading confirmed evidence…</p>
            ) : evidenceQuery.isError ? (
              <div className="grid gap-2">
                <p className="small-copy text-destructive" role="alert">
                  Confirmed evidence could not be loaded. You can still create a blank CV.
                </p>
                <Button type="button" size="sm" variant="outline" onClick={() => void evidenceQuery.refetch()}>
                  Try again
                </Button>
              </div>
            ) : confirmedItems.length === 0 ? (
              <p className="small-copy muted-copy">
                No confirmed evidence is available yet. This CV will start blank.
              </p>
            ) : confirmedItems.map((item) => {
              const inputId = `cv-evidence-${item.id}`
              return (
                <label key={item.id} htmlFor={inputId} className="flex items-start gap-3 rounded-[var(--radius-md)] p-2 hover:bg-muted/50">
                  <input
                    id={inputId}
                    type="checkbox"
                    className="mt-1"
                    checked={selectedIds.includes(item.id)}
                    disabled={submitting}
                    onChange={(event) => setSelectedIds((current) => event.target.checked
                      ? [...current, item.id]
                      : current.filter((id) => id !== item.id))}
                  />
                  <span className="grid min-w-0 gap-0.5">
                    <span className="text-xs font-medium text-muted-foreground">{KIND_LABELS[item.kind]}</span>
                    <span className="break-words text-sm text-foreground">{evidenceSummary(item)}</span>
                  </span>
                </label>
              )
            })}
          </fieldset>

          {error ? (
            <p role="alert" className="small-copy text-destructive">{error}</p>
          ) : null}

          <DialogFooter>
            <Button type="button" variant="outline" disabled={submitting} onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" loading={submitting} disabled={submitting || !name.trim()}>
              {submitting ? 'Creating CV…' : 'Create CV'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

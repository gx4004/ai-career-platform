import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  Button, Checkbox, Dialog, DialogBody, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogForm,
  DialogHeader, DialogTitle, EmptyState, Field, Input, Notice, Section, Skeleton, Stack,
} from '#/components/kit'
import { createCvDocument, listEvidenceItems } from '#/lib/api/client'
import type { CvDocument, EvidenceItem } from '#/lib/api/schemas'
import { EVIDENCE_QUERY_KEY, KIND_LABELS, contentEntries } from '#/lib/profile/evidence'

function evidenceSummary(item: EvidenceItem) {
  const content = contentEntries(item.content)
    .map(({ value }) => value)
    .filter(Boolean)
    .join(' · ')
  return content || 'Confirmed fact'
}

export function CreateCvDocumentDialog({
  open,
  onOpenChange,
  onCreated,
  onCloseAutoFocus,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  onCreated: (document: CvDocument) => void
  /** Where focus goes on close, when the control that opened the dialog is gone (a menu item). */
  onCloseAutoFocus?: (event: Event) => void
}) {
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
      setError(caught instanceof Error ? caught.message : 'We couldn’t create your CV.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent dismissible={!submitting} onCloseAutoFocus={onCloseAutoFocus}>
        <DialogForm onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>Start a new CV</DialogTitle>
            <DialogDescription>
              Start blank, or pick facts you’ve already confirmed in your Evidence and we’ll add
              them for you.
            </DialogDescription>
          </DialogHeader>

          <DialogBody className="cvs-create__body">
            <Stack gap={6}>
              <Field label="CV name">
                <Input value={name} maxLength={120} required disabled={submitting} onChange={(event) => setName(event.target.value)} />
              </Field>

              <Section headingLevel={3} title="Facts from your Evidence (optional)">
                {evidenceQuery.isLoading ? (
                  <div role="status" aria-label="Loading your Evidence"><Skeleton lines={3} /></div>
                ) : evidenceQuery.isError ? (
                  <Notice tone="danger" action={<Button type="button" size="sm" variant="secondary" onClick={() => void evidenceQuery.refetch()}>Try again</Button>}>
                    We couldn’t load your Evidence. You can still start a blank CV.
                  </Notice>
                ) : confirmedItems.length === 0 ? (
                  <EmptyState size="inline" title="You haven’t confirmed any facts in your Evidence yet, so this CV will start blank." />
                ) : (
                  <Stack gap={3}>
                    {confirmedItems.map((item) => (
                      <Checkbox
                        key={item.id}
                        label={evidenceSummary(item)}
                        description={KIND_LABELS[item.kind]}
                        checked={selectedIds.includes(item.id)}
                        disabled={submitting}
                        onCheckedChange={(checked) => setSelectedIds((current) => checked
                          ? [...current, item.id]
                          : current.filter((id) => id !== item.id))}
                      />
                    ))}
                  </Stack>
                )}
              </Section>

              {error ? <Notice tone="danger">{error}</Notice> : null}
            </Stack>
          </DialogBody>

          <DialogFooter>
            <DialogClose asChild><Button type="button" variant="secondary" disabled={submitting}>Cancel</Button></DialogClose>
            <Button type="submit" loading={submitting} disabled={!name.trim()}>
              {submitting ? 'Creating CV…' : 'Create CV'}
            </Button>
          </DialogFooter>
        </DialogForm>
      </DialogContent>
    </Dialog>
  )
}

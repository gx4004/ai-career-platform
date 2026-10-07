import { useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import {
  Button, Checkbox, Dialog, DialogBody, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogForm,
  DialogHeader, DialogTitle, EmptyState, Field, Input, Notice, Section, Skeleton, Stack,
} from '#/components/kit'
import { useSession } from '#/hooks/useSession'
import { createCvDocument, listEvidenceItems } from '#/lib/api/client'
import type { CvDocument, EvidenceItem } from '#/lib/api/schemas'
import { EVIDENCE_QUERY_KEY, KIND_SINGULAR_LABELS, contentEntries } from '#/lib/profile/evidence'

/** A fact can be 2,000 characters; a checkbox label shows its start, and the CV gets all of it. */
const SUMMARY_CHARS = 160

function evidenceSummary(item: EvidenceItem) {
  const content = contentEntries(item.content)
    .map(({ value }) => value)
    .filter(Boolean)
    .join(' · ')
  if (!content) return 'Saved fact'
  return content.length > SUMMARY_CHARS ? `${content.slice(0, SUMMARY_CHARS - 1).trimEnd()}…` : content
}

export function CreateCvDocumentDialog({
  open,
  preselectAll = false,
  onOpenChange,
  onCreated,
  onCloseAutoFocus,
}: {
  open: boolean
  /** Tick every saved fact once they load (the profile's "Start a CV from these facts" hand-off). */
  preselectAll?: boolean
  onOpenChange: (open: boolean) => void
  onCreated: (document: CvDocument) => void
  /** Where focus goes on close, when the control that opened the dialog is gone (a menu item). */
  onCloseAutoFocus?: (event: Event) => void
}) {
  // Named after its person, like an import, so the export is "Jordan Ellis CV.pdf" rather than "My CV.pdf".
  const fullName = useSession().user?.full_name?.trim()
  const defaultName = fullName ? `${fullName} CV` : 'My CV'
  const [name, setName] = useState(defaultName)
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

  const preselected = useRef(false)

  useEffect(() => {
    if (!open) return
    setName(defaultName)
    setSelectedIds([])
    setError('')
    preselected.current = false
  }, [open, defaultName])

  // Declared after the reset so a cached list is ticked in the same commit the dialog opens.
  useEffect(() => {
    if (!open || !preselectAll || !evidenceQuery.isSuccess || preselected.current) return
    preselected.current = true
    setSelectedIds(evidenceQuery.data.filter((item) => item.confirmation_state === 'confirmed').map((item) => item.id))
  }, [open, preselectAll, evidenceQuery.isSuccess, evidenceQuery.data])

  const allSelected = confirmedItems.length > 0 && confirmedItems.every((item) => selectedIds.includes(item.id))

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
              Start blank, or pick facts you saved on your profile and we’ll add them for you.
            </DialogDescription>
          </DialogHeader>

          <DialogBody className="cvs-create__body">
            <Stack gap={6}>
              <Field label="CV name">
                <Input value={name} maxLength={120} required disabled={submitting} onChange={(event) => setName(event.target.value)} />
              </Field>

              <Section
                headingLevel={3}
                size="sm"
                title="Facts from your profile"
                // "Select all" / "Clear" belongs to the heading: at 320 it wrapped onto a line of its own (F38).
                actionsWrap={false}
                actions={confirmedItems.length > 1 ? (
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    disabled={submitting}
                    onClick={() => setSelectedIds(allSelected ? [] : confirmedItems.map((item) => item.id))}
                  >
                    {allSelected ? 'Clear' : 'Select all'}
                  </Button>
                ) : null}
              >
                {evidenceQuery.isLoading ? (
                  <div role="status" aria-label="Loading your profile"><Skeleton lines={3} /></div>
                ) : evidenceQuery.isError ? (
                  <Notice tone="danger" action={<Button type="button" size="sm" variant="secondary" onClick={() => void evidenceQuery.refetch()}>Try again</Button>}>
                    We couldn’t load your profile. You can still start a blank CV.
                  </Notice>
                ) : confirmedItems.length === 0 ? (
                  // The profile is where facts are added: lead there instead of ending on a blank CV (cv-studio-F12).
                  <EmptyState
                    size="inline" title="You haven’t saved any facts on your profile yet, so this CV will start blank."
                    action={<Button asChild size="sm" variant="secondary"><Link to="/profile">Add facts on your profile</Link></Button>}
                  />
                ) : (
                  <Stack gap={3}>
                    {confirmedItems.map((item) => (
                      <Checkbox
                        key={item.id}
                        label={evidenceSummary(item)}
                        description={KIND_SINGULAR_LABELS[item.kind]}
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

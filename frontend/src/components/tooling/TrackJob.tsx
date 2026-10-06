import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { Link } from '@tanstack/react-router'
import { useQueryClient } from '@tanstack/react-query'
import { Briefcase } from 'lucide-react'
import {
  Button,
  Dialog,
  DialogBody,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogForm,
  DialogHeader,
  DialogTitle,
  Field,
  Input,
  Notice,
  Row,
  RowBody,
  RowLeading,
  RowMeta,
  RowSubtitle,
  RowTitle,
  Stack,
  Textarea,
  ToolTile,
  useToast,
} from '#/components/kit'
import { request } from '#/lib/api/client'
import { describeFailure } from '#/lib/api/errors'
import { applicationCreateSchema, applicationDetailSchema } from '#/lib/api/schemas'
import type { ApplicationCreate, ToolRunDetail } from '#/lib/api/schemas'
import { invalidateApplications } from '#/lib/query/applicationCaches'
import { readWorkflowContext } from '#/lib/tools/drafts'

/** POST /applications for a Job Match run. Tracking the same run again answers with the application it already became. */
export function trackJobMatch(payload: ApplicationCreate) {
  return request('/applications', {
    method: 'POST',
    body: applicationCreateSchema.parse(payload),
    schema: applicationDetailSchema,
  })
}

type Tracked = { id: string; name: string }

function trackedFrom(item: ToolRunDetail): Tracked | null {
  const workspace = item.workspace
  if (!workspace || !(workspace.status || workspace.listing)) return null
  const name = [workspace.role, workspace.company].filter(Boolean).join(' at ') || workspace.listing?.title || workspace.label || 'This job'
  return { id: workspace.id, name }
}

/**
 * The first "What next" row of a saved Job Match: track the job in Applications (as Saved, with this
 * match attached), or open the application it already is. A secondary action: the page's one primary
 * stays Re-generate.
 */
export function TrackJobRow({ item }: { item: ToolRunDetail }) {
  const queryClient = useQueryClient()
  const { toast } = useToast()
  const [tracked, setTracked] = useState<Tracked | null>(() => trackedFrom(item))
  const [open, setOpen] = useState(false)
  const [role, setRole] = useState('')
  const [company, setCompany] = useState('')
  const [description, setDescription] = useState('')
  const [prefilled, setPrefilled] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [failure, setFailure] = useState<{ message: string; fields: Partial<Record<string, string>> } | null>(null)

  useEffect(() => {
    setTracked(trackedFrom(item))
  }, [item])

  function openDialog() {
    // What the run already knows; the posting itself is only here when this tab ran the match.
    const context = readWorkflowContext()
    const job = context?.jobDescription?.trim() ?? ''
    setRole(item.workspace?.role ?? '')
    setCompany(item.workspace?.company ?? '')
    const prefill = job.length >= 20 ? job.slice(0, 20_000) : ''
    setDescription(prefill)
    setPrefilled(Boolean(prefill))
    setFailure(null)
    setOpen(true)
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (submitting) return
    setSubmitting(true)
    setFailure(null)
    try {
      const application = await trackJobMatch({
        history_id: item.id,
        role: role.trim(),
        company: company.trim(),
        description: description.trim() || null,
      })
      const name = [application.title ?? role.trim(), application.company ?? company.trim()].filter(Boolean).join(' at ')
      setTracked({ id: application.id, name })
      setOpen(false)
      toast({ tone: 'success', title: 'Added to your applications', description: name || undefined })
      void invalidateApplications(queryClient)
      // The header's "In applications" link reads the run's workspace; a run read from the cache never refetches.
      queryClient.setQueryData(['tool-run', item.id], (old: unknown) =>
        old && typeof old === 'object'
          ? {
              ...old,
              workspace: {
                ...((old as ToolRunDetail).workspace ?? { linked_run_ids: [item.id] }),
                id: application.id,
                label: application.label,
                company: application.company,
                role: application.role ?? application.title,
                status: application.status,
                deadline: application.deadline,
                listing: application.listing,
                is_pinned: application.is_pinned,
                updated_at: application.updated_at,
              },
            }
          : old,
      )
    } catch (caught) {
      const { message, fields } = describeFailure(caught, 'This job could not be tracked. Try again.')
      setFailure({ message, fields })
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Row>
      <RowLeading>
        {/* White, not a tool colour: Applications is a destination, and lemon already means Cover Letter in this list. */}
        <ToolTile tone="white" icon={Briefcase} size="lg" />
      </RowLeading>
      <RowBody>
        <RowTitle size="lg">{tracked ? 'In your applications' : 'Track this job'}</RowTitle>
        <RowSubtitle>
          {tracked ? tracked.name : 'Add it to Applications as Saved, with this match attached.'}
        </RowSubtitle>
      </RowBody>
      <RowMeta>
        {tracked ? (
          <Button asChild variant="secondary" size="sm">
            <Link to="/campaigns/$campaignId" params={{ campaignId: tracked.id }}>
              Open application
            </Link>
          </Button>
        ) : (
          <Button type="button" variant="secondary" size="sm" onClick={openDialog}>
            Track job
          </Button>
        )}
      </RowMeta>
      <Dialog open={open} onOpenChange={(next) => (submitting ? null : setOpen(next))}>
        <DialogContent dismissible={!submitting}>
          <DialogForm onSubmit={handleSubmit} aria-label="Track this job">
            <DialogHeader>
              <DialogTitle>Track this job</DialogTitle>
              <DialogDescription>It goes into Applications as Saved, with this Job Match attached.</DialogDescription>
            </DialogHeader>
            <DialogBody>
              <Stack gap={4}>
                <Field label="Role" required error={failure?.fields.role}>
                  <Input value={role} maxLength={200} autoComplete="off" disabled={submitting} onChange={(event) => setRole(event.target.value)} />
                </Field>
                <Field label="Company" required error={failure?.fields.company}>
                  <Input value={company} maxLength={200} autoComplete="organization" disabled={submitting} onChange={(event) => setCompany(event.target.value)} />
                </Field>
                <Field
                  label="Job description"
                  optional
                  help={prefilled ? 'From the match you ran in this tab. Edit or clear it.' : 'Paste the posting to keep it with the application.'}
                  error={failure?.fields.description}
                >
                  <Textarea value={description} rows={5} maxLength={20_000} disabled={submitting} onChange={(event) => setDescription(event.target.value)} />
                </Field>
                {failure ? <Notice tone="danger">{failure.message}</Notice> : null}
              </Stack>
            </DialogBody>
            <DialogFooter>
              <DialogClose asChild>
                <Button type="button" variant="secondary" disabled={submitting}>Cancel</Button>
              </DialogClose>
              <Button type="submit" loading={submitting} disabled={!role.trim() || !company.trim()}>
                Track job
              </Button>
            </DialogFooter>
          </DialogForm>
        </DialogContent>
      </Dialog>
    </Row>
  )
}

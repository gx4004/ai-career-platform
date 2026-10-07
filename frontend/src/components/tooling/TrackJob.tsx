import { useEffect, useRef, useState } from 'react'
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
  focusFieldOnOpen,
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
import { JOB_FIELD_MESSAGES } from '#/components/applications/AddApplicationDialog'
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

/**
 * Role and company the app itself wrote down for this job: the "Role at Company" header that Discovery and
 * the dashboard put on the first line of a job description they hand over (with that role as the target
 * role), or a re-generate's job label. A posting the user pasted is never split on its first " at ".
 */
export function knownJob(
  jobDescription: string,
  { targetRole, jobLabel }: { targetRole?: string; jobLabel?: string } = {},
): { role: string; company: string } | null {
  const [first = '', second] = jobDescription.split('\n')
  const role = targetRole?.trim() ?? ''
  const header = first.trim()
  if (role && second !== undefined && second.trim() === '' && header.startsWith(`${role} at `)) {
    const company = header.slice(role.length + 4).trim()
    if (company) return { role, company }
  }
  const label = jobLabel?.trim() ?? ''
  const at = label.length <= 240 ? label.lastIndexOf(' at ') : -1
  if (at > 0) return { role: label.slice(0, at).trim(), company: label.slice(at + 4).trim() }
  return null
}

/** The role and company the Job Match run itself names, when the backend reports them. */
function runJob(item: ToolRunDetail): { role: string; company: string } {
  const payload = (item.result_payload ?? {}) as Record<string, unknown>
  const text = (value: unknown) => (typeof value === 'string' ? value.trim() : '')
  return { role: text(payload.job_title), company: text(payload.company) }
}

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
  const roleRef = useRef<HTMLInputElement>(null)
  const companyRef = useRef<HTMLInputElement>(null)
  const [failure, setFailure] = useState<{ message: string; fields: Partial<Record<string, string>> } | null>(null)
  // Said on submit, as in "Add a job": the button stays enabled and each empty required field gets its sentence.
  const [missing, setMissing] = useState<{ role?: string; company?: string }>({})

  useEffect(() => {
    setTracked(trackedFrom(item))
  }, [item])

  function openDialog() {
    // What the run already knows; the posting itself is only here when this tab ran the match.
    const context = readWorkflowContext()
    const job = context?.jobDescription?.trim() ?? ''
    const known = knownJob(job, { targetRole: context?.targetRole, jobLabel: context?.jobLabel })
    const fromRun = runJob(item)
    setRole(item.workspace?.role || fromRun.role || known?.role || '')
    setCompany(item.workspace?.company || fromRun.company || known?.company || '')
    const prefill = job.length >= 20 ? job.slice(0, 20_000) : ''
    setDescription(prefill)
    setPrefilled(Boolean(prefill))
    setFailure(null)
    setMissing({})
    setOpen(true)
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (submitting) return
    const found = {
      role: role.trim() ? undefined : JOB_FIELD_MESSAGES.role,
      company: company.trim() ? undefined : JOB_FIELD_MESSAGES.company,
    }
    setMissing(found)
    if (found.role || found.company) {
      setFailure(null)
      const first = found.role ? roleRef.current : companyRef.current
      first?.focus()
      return
    }
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
        <ToolTile tone="white" icon={Briefcase} size="lg" flat />
      </RowLeading>
      <RowBody>
        <RowTitle size="lg">{tracked ? 'In your applications' : 'Track this job'}</RowTitle>
        <RowSubtitle size="lg">
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
        <DialogContent
          dismissible={!submitting}
          // Focus lands on the first required field still empty (Company, when the role came from the match). On a touch
          // screen the dialog takes focus instead, as "Add a job" does, so the keyboard does not cover it unread
          // (consistency-F24).
          onOpenAutoFocus={(event) =>
            focusFieldOnOpen(event, !role.trim() ? roleRef.current : !company.trim() ? companyRef.current : null)
          }
        >
          <DialogForm onSubmit={handleSubmit} aria-label="Track this job" noValidate>
            <DialogHeader>
              <DialogTitle>Track this job</DialogTitle>
              <DialogDescription>It goes into Applications as Saved, with this Job Match attached.</DialogDescription>
            </DialogHeader>
            <DialogBody>
              <Stack gap={4}>
                <Field label="Role" required error={missing.role ?? failure?.fields.role}>
                  <Input
                    ref={roleRef}
                    value={role}
                    maxLength={200}
                    autoComplete="off"
                    disabled={submitting}
                    onChange={(event) => {
                      setRole(event.target.value)
                      setMissing((current) => ({ ...current, role: undefined }))
                    }}
                  />
                </Field>
                <Field label="Company" required error={missing.company ?? failure?.fields.company}>
                  <Input
                    ref={companyRef}
                    value={company}
                    maxLength={200}
                    autoComplete="organization"
                    disabled={submitting}
                    onChange={(event) => {
                      setCompany(event.target.value)
                      setMissing((current) => ({ ...current, company: undefined }))
                    }}
                  />
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
              <Button type="submit" loading={submitting}>
                Track job
              </Button>
            </DialogFooter>
          </DialogForm>
        </DialogContent>
      </Dialog>
    </Row>
  )
}

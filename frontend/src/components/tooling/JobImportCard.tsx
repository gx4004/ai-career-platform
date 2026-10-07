import { useState, type ComponentProps } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import {
  Button,
  Checkbox,
  Cluster,
  Field,
  Input,
  Notice,
  Panel,
  PanelBody,
  Select,
  Stack,
  useFieldControl,
} from '#/components/kit'
import { useSession } from '#/hooks/useSession'
import { importJobText, importJobUrl, listApplications } from '#/lib/api/client'
import type { ApplicationCard, ImportedJobPost } from '#/lib/api/schemas'

/** No tier could read a job posting there (a blocked board, or a page that is not a job ad): paste instead. */
function isUnreadable(data: ImportedJobPost) {
  return data.readable === false || !data.job_description.trim()
}

function applicationName(item: ApplicationCard) {
  const title = item.title?.trim() || item.label?.trim() || 'Untitled application'
  const company = item.company?.trim()
  return company ? `${title} at ${company}` : title
}

/** Marked applied: its job posting can no longer be swapped. */
function isApplied(item: ApplicationCard) {
  return Boolean(item.applied_at)
}

/** "jobs.example.com", for "filled from …"; the URL as typed when it does not parse. */
function hostOf(url: string) {
  try {
    return new URL(url.trim()).hostname.replace(/^www\./, '') || 'that page'
  } catch {
    return 'that page'
  }
}

function errorText(error: unknown, fallback: string) {
  return error instanceof Error && error.message ? error.message : fallback
}

/** Fill the job description from a posting URL, and (signed in) optionally attach the listing to an application. */
export function JobImportCard({
  onImported,
  current,
}: {
  onImported: (description: string) => void
  /** What the page's job description field holds now: an import never overwrites typed text without asking. */
  current?: string
}) {
  const { status } = useSession()
  const canAttach = status === 'authenticated'
  const [url, setUrl] = useState('')
  const [attach, setAttach] = useState(false)
  const [campaignId, setCampaignId] = useState('')
  const [title, setTitle] = useState('')
  const [company, setCompany] = useState('')
  const [unreadable, setUnreadable] = useState(false)
  // The application the posting was saved to, and how: an import saves the imported posting there at once (whatever the
  // form field ends up holding); "Attach job description" saves the form's own text.
  const [attachedTo, setAttachedTo] = useState<{ name: string; by: 'import' | 'text' } | null>(null)
  // An import waiting for the user's go-ahead (the field already had other text), and the last fill (for Undo).
  const [pending, setPending] = useState<{ text: string; from: string } | null>(null)
  const [filled, setFilled] = useState<{ text: string; from: string; previous: string } | null>(null)
  const applications = useQuery({
    queryKey: ['applications', 'listing-attach'],
    queryFn: listApplications,
    enabled: attach && canAttach,
  })
  const items = applications.data?.items
  const noApplications = items?.length === 0
  const anyOpen = Boolean(items?.some((item) => !isApplied(item)))
  // Ticking "attach" only holds the import back while there is an application left to pick.
  const attachNeedsPick = attach && (applications.isPending || anyOpen) && !campaignId
  const fill = (text: string, from: string) => {
    const previous = current ?? ''
    if (previous.trim() && previous.trim() !== text.trim()) {
      setPending({ text, from })
      setFilled(null)
      return
    }
    setPending(null)
    onImported(text)
    setFilled({ text, from, previous })
  }
  const replaceWithPending = () => {
    if (!pending) return
    const previous = current ?? ''
    onImported(pending.text)
    setFilled({ ...pending, previous })
    setPending(null)
  }
  const selectedName = () => {
    const match = applications.data?.items.find((item) => item.id === campaignId)
    return match ? applicationName(match) : 'your application'
  }
  const mutation = useMutation({
    mutationFn: importJobUrl,
    onMutate: () => {
      setUnreadable(false)
      setAttachedTo(null)
      setPending(null)
      setFilled(null)
    },
    onSuccess: (data, variables) => {
      if (isUnreadable(data)) {
        // Leave whatever the user already has in the job description alone.
        setUnreadable(true)
        return
      }
      fill(data.job_description, hostOf(variables.url))
      if (variables.campaign_id) setAttachedTo({ name: selectedName(), by: 'import' })
    },
  })
  // Attaches the job description the form already holds (one place to paste a posting): nothing is written back into it.
  const pasteMutation = useMutation({
    mutationFn: importJobText,
    onMutate: () => {
      setAttachedTo(null)
      setPending(null)
      setFilled(null)
    },
    onSuccess: () => {
      setAttachedTo({ name: selectedName(), by: 'text' })
    },
  })
  const pickApplication = (id: string) => {
    setCampaignId(id)
    // Title and company start from the application the posting belongs to; both stay editable.
    const match = applications.data?.items.find((item) => item.id === id)
    setTitle(match?.title?.trim() ?? '')
    setCompany(match?.company?.trim() ?? '')
  }
  const formDescription = (current ?? '').trim()
  const canAttachText = Boolean(title.trim() && company.trim()) && formDescription.length >= 20

  const canImport = Boolean(url.trim()) && !attachNeedsPick
  const runImport = () => {
    if (!canImport || mutation.isPending) return
    mutation.mutate({
      url,
      ...(attach && campaignId ? { campaign_id: campaignId } : {}),
    })
  }

  return (
    <Stack gap={3}>
      <Panel tone="stone">
        <PanelBody className="tool-import">
          <Stack gap={3}>
            <Field
              label="Import from job URL"
              optional
              id="job-import-url"
              error={mutation.error ? errorText(mutation.error, 'Job import failed.') : undefined}
            >
              {/* The button sits beside the input, not in its frame (on touch a 44px button in the 44px frame doubled its border);
                  where the input would drop under 12rem (a phone) the button moves under it instead. */}
              <Cluster gap={3} className="tool-import__url">
                <Input
                  inputMode="url"
                  autoComplete="off"
                  value={url}
                  onChange={(event) => {
                    setUrl(event.target.value)
                    setUnreadable(false)
                  }}
                  onKeyDown={(event) => {
                    // Enter here imports the posting; it must not submit the whole tool form behind it.
                    if (event.key !== 'Enter') return
                    event.preventDefault()
                    runImport()
                  }}
                  placeholder="https://"
                />
                <Button type="button" variant="secondary" loading={mutation.isPending} onClick={runImport} disabled={!canImport}>
                  Import
                </Button>
              </Cluster>
            </Field>
            {canAttach ? (
              <Checkbox
                id="campaign-attach-toggle"
                label="Attach to one of your applications"
                checked={attach}
                onCheckedChange={setAttach}
              />
            ) : null}
            {canAttach && attach && noApplications ? (
              <Notice
                action={
                  <Button asChild variant="secondary" size="sm">
                    <Link to="/discovery">Discover jobs</Link>
                  </Button>
                }
              >
                You have no applications yet. Save a job from Discover, or add one on{' '}
                <Link to="/campaigns">Applications</Link>, then attach its listing here.
              </Notice>
            ) : null}
            {canAttach && attach && !noApplications ? (
              <Stack gap={4} className="tool-attach" role="group" aria-label="Application listing attachment">
                <Field
                  label="Application"
                  id="campaign-listing-picker"
                  // Ticking "attach" holds Import back until an application is picked: say so, instead of a silently grey button.
                  help={attachNeedsPick && !applications.isPending ? 'Pick the application this posting belongs to, then Import.' : undefined}
                >
                  <Select value={campaignId} onChange={(event) => pickApplication(event.target.value)}>
                    <option value="">
                      {applications.isPending
                        ? 'Loading your applications…'
                        : items?.every(isApplied)
                          ? 'All your applications are already applied'
                          : 'Select an application'}
                    </option>
                    {/* What was sent is frozen: an applied application keeps its posting (the API refuses with a 409),
                        so it is listed after the others, greyed out and marked Applied. */}
                    {[...(applications.data?.items ?? [])]
                      .sort((a, b) => Number(isApplied(a)) - Number(isApplied(b)))
                      .map((item) => (
                        <option key={item.id} value={item.id} disabled={isApplied(item)}>
                          {isApplied(item) ? `${applicationName(item)} (Applied)` : applicationName(item)}
                        </option>
                      ))}
                  </Select>
                </Field>
                {/* No URL to import? The job description on this form can go to the picked application instead. */}
                {campaignId ? (
                  <Stack gap={3} role="group" aria-labelledby="campaign-attach-text-lead">
                    <p id="campaign-attach-text-lead" className="tool-optional__hint">
                      No posting URL? Attach the job description below to this application.
                    </p>
                    <Field label="Job title" id="campaign-job-title">
                      <Input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Job title" maxLength={200} />
                    </Field>
                    <Field label="Company" id="campaign-job-company">
                      <Input value={company} onChange={(event) => setCompany(event.target.value)} placeholder="Company" maxLength={200} />
                    </Field>
                    <Field
                      id="campaign-job-attach"
                      help={formDescription.length < 20 ? 'Paste the job description below first.' : undefined}
                    >
                      <div>
                        <FieldButton
                          type="button"
                          variant="secondary"
                          size="sm"
                          loading={pasteMutation.isPending}
                          onClick={() =>
                            pasteMutation.mutate({
                              campaign_id: campaignId,
                              job_title: title.trim(),
                              company_name: company.trim(),
                              job_description: formDescription,
                            })
                          }
                          disabled={!canAttachText}
                        >
                          Attach job description
                        </FieldButton>
                      </div>
                    </Field>
                  </Stack>
                ) : null}
                {applications.error ? (
                  <Notice tone="danger">{errorText(applications.error, 'Could not load your applications.')}</Notice>
                ) : null}
                {pasteMutation.error ? (
                  <Notice tone="danger">{errorText(pasteMutation.error, 'Could not attach the listing.')}</Notice>
                ) : null}
              </Stack>
            ) : null}
          </Stack>
        </PanelBody>
      </Panel>
      {/* What an import did, outside the stone panel: three nested paddings left a phone a 150px column of text. */}
      {unreadable ? (
        <Notice tone="warning" title="Couldn't read that page">
          The site may block automated readers, or the page may not be a job posting. Paste the job
          description below instead; what you already had there is untouched.
        </Notice>
      ) : null}
      {/* Before the Replace / Keep mine question: the application already holds the imported posting, so the question is
          only about the form field below (sign-off tool-inputs-F32). */}
      {attachedTo?.by === 'import' ? (
        <Notice tone="success">The imported posting was saved to {attachedTo.name}.</Notice>
      ) : null}
      {pending ? (
        // The two choices sit under the sentence they answer (beside it they squeezed the text to a 190px column on a
        // tablet) and span the notice on a phone. Short labels keep them one row at 320px; the question carries the meaning.
        <Notice
          title={`Imported the posting from ${pending.from}`}
          actionPlacement="below"
          action={
            <>
              <Button type="button" variant="secondary" size="sm" onClick={replaceWithPending}>
                Replace
              </Button>
              <Button type="button" variant="ghost" size="sm" onClick={() => setPending(null)}>
                Keep mine
              </Button>
            </>
          }
        >
          Your job description below already has text. Replace it with the posting, or keep yours?
        </Notice>
      ) : null}
      {filled && (current === undefined || current === filled.text) ? (
        <Notice
          tone="success"
          action={
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => {
                onImported(filled.previous)
                setFilled(null)
              }}
            >
              Undo
            </Button>
          }
        >
          Job description filled from {filled.from}.
        </Notice>
      ) : null}
      {attachedTo?.by === 'text' ? <Notice tone="success">Listing attached to {attachedTo.name}.</Notice> : null}
    </Stack>
  )
}

/**
 * A kit Button described by the help of the Field around it, read through the kit's own Field contract
 * (`useFieldControl`) rather than a copy of how Field builds its help id. Its name stays its own text.
 */
function FieldButton(props: ComponentProps<typeof Button>) {
  const { describedBy } = useFieldControl({ 'aria-describedby': props['aria-describedby'] })
  return <Button {...props} aria-describedby={describedBy} />
}

import { useState } from 'react'
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
  Section,
  Select,
  Stack,
  Textarea,
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
  const [description, setDescription] = useState('')
  const [unreadable, setUnreadable] = useState(false)
  const [attachedTo, setAttachedTo] = useState<string | null>(null)
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
      if (variables.campaign_id) setAttachedTo(selectedName())
    },
  })
  const pasteMutation = useMutation({
    mutationFn: importJobText,
    onMutate: () => {
      setAttachedTo(null)
      setPending(null)
      setFilled(null)
    },
    onSuccess: (data) => {
      fill(data.job_description, 'your pasted listing')
      setAttachedTo(selectedName())
    },
  })

  const canImport = Boolean(url.trim()) && !attachNeedsPick
  const runImport = () => {
    if (!canImport || mutation.isPending) return
    mutation.mutate({
      url,
      ...(attach && campaignId ? { campaign_id: campaignId } : {}),
    })
  }

  return (
    <Panel tone="stone">
      <PanelBody className="tool-import">
        <Stack gap={3}>
          <Field
            label="Import from job URL"
            optional
            id="job-import-url"
            error={mutation.error ? errorText(mutation.error, 'Job import failed.') : undefined}
          >
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
              placeholder="Job posting URL"
              trailing={
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  loading={mutation.isPending}
                  onClick={runImport}
                  disabled={!canImport}
                >
                  Import
                </Button>
              }
            />
          </Field>
          {unreadable ? (
            <Notice tone="warning" title="Couldn't read that page">
              The site may block automated readers, or the page may not be a job posting. Paste the job
              description below instead; what you already had there is untouched.
            </Notice>
          ) : null}
          {pending ? (
            <Notice
              title={`Imported the posting from ${pending.from}`}
              action={
                <Cluster gap={2}>
                  <Button type="button" variant="secondary" size="sm" onClick={replaceWithPending}>
                    Replace my description
                  </Button>
                  <Button type="button" variant="ghost" size="sm" onClick={() => setPending(null)}>
                    Keep mine
                  </Button>
                </Cluster>
              }
            >
              Your job description below already has text. Nothing changes until you choose.
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
          {attachedTo ? <Notice tone="success">Listing attached to {attachedTo}.</Notice> : null}
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
                  <Link to="/discovery">Find jobs</Link>
                </Button>
              }
            >
              You have no applications yet. Save a job from Discover, or add one on{' '}
              <Link to="/campaigns">Applications</Link>, then attach its listing here.
            </Notice>
          ) : null}
          {canAttach && attach && !noApplications ? (
            <Stack gap={4} className="tool-attach" role="group" aria-label="Application listing attachment">
              <Field label="Application" id="campaign-listing-picker">
                <Select value={campaignId} onChange={(event) => setCampaignId(event.target.value)}>
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
              {/* The pasted listing goes to the picked application, so it is only offered once one is picked. */}
              {campaignId ? (
                <Section headingLevel={3} size="sm" title="Or attach a pasted listing" rule={false}>
                  <Stack gap={3}>
                    <Field label="Job title" id="campaign-job-title">
                      <Input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Job title" maxLength={200} />
                    </Field>
                    <Field label="Company" id="campaign-job-company">
                      <Input value={company} onChange={(event) => setCompany(event.target.value)} placeholder="Company" maxLength={200} />
                    </Field>
                    <Field label="Pasted listing text" id="campaign-job-description">
                      <Textarea
                        rows={4}
                        value={description}
                        onChange={(event) => setDescription(event.target.value)}
                        placeholder="Paste the job description"
                        maxLength={20_000}
                      />
                    </Field>
                    <div>
                      <Button
                        type="button"
                        variant="secondary"
                        size="sm"
                        loading={pasteMutation.isPending}
                        onClick={() => pasteMutation.mutate({ campaign_id: campaignId, job_title: title, company_name: company, job_description: description })}
                        disabled={!title.trim() || !company.trim() || description.trim().length < 20}
                      >
                        Attach pasted listing
                      </Button>
                    </div>
                  </Stack>
                </Section>
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
  )
}

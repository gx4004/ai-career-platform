import { useState } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import {
  Button,
  Checkbox,
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

function errorText(error: unknown, fallback: string) {
  return error instanceof Error && error.message ? error.message : fallback
}

/** Fill the job description from a posting URL, and (signed in) optionally attach the listing to an application. */
export function JobImportCard({
  onImported,
}: {
  onImported: (description: string) => void
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
  const applications = useQuery({
    queryKey: ['applications', 'listing-attach'],
    queryFn: listApplications,
    enabled: attach && canAttach,
  })
  const selectedName = () => {
    const match = applications.data?.items.find((item) => item.id === campaignId)
    return match ? applicationName(match) : 'your application'
  }
  const mutation = useMutation({
    mutationFn: importJobUrl,
    onMutate: () => {
      setUnreadable(false)
      setAttachedTo(null)
    },
    onSuccess: (data, variables) => {
      if (isUnreadable(data)) {
        // Leave whatever the user already has in the job description alone.
        setUnreadable(true)
        return
      }
      onImported(data.job_description)
      if (variables.campaign_id) setAttachedTo(selectedName())
    },
  })
  const pasteMutation = useMutation({
    mutationFn: importJobText,
    onMutate: () => setAttachedTo(null),
    onSuccess: (data) => {
      onImported(data.job_description)
      setAttachedTo(selectedName())
    },
  })

  const canImport = Boolean(url.trim()) && !(attach && !campaignId)
  const runImport = () => {
    if (!canImport || mutation.isPending) return
    mutation.mutate({
      url,
      ...(attach && campaignId ? { campaign_id: campaignId } : {}),
    })
  }

  return (
    <Panel tone="stone">
      <PanelBody>
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
          {attachedTo ? <Notice tone="success">Listing attached to {attachedTo}.</Notice> : null}
          {canAttach ? (
            <Checkbox
              id="campaign-attach-toggle"
              label="Attach to one of your applications"
              checked={attach}
              onCheckedChange={setAttach}
            />
          ) : null}
          {canAttach && attach ? (
            <Stack gap={4} className="tool-attach" role="group" aria-label="Application listing attachment">
              <Field label="Application" id="campaign-listing-picker">
                <Select value={campaignId} onChange={(event) => setCampaignId(event.target.value)}>
                  <option value="">
                    {applications.isPending
                      ? 'Loading your applications…'
                      : applications.data?.items.length === 0
                        ? 'No applications yet'
                        : applications.data?.items.every(isApplied)
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
                      disabled={!campaignId || !title.trim() || !company.trim() || description.trim().length < 20}
                    >
                      Attach pasted listing
                    </Button>
                  </div>
                </Stack>
              </Section>
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

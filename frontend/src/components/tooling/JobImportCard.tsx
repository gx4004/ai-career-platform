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
import type { ApplicationCard } from '#/lib/api/schemas'

/**
 * What the importer hands back when no tier could read the page (backend PASTE_FALLBACK_DESCRIPTION).
 * It arrives as a 200 with a sentence in the description field, so it has to be recognised here or it
 * would land in the user's job description.
 */
const UNREADABLE_PREFIX = 'could not extract the job description'

function isUnreadable(description: string | null | undefined) {
  const text = (description ?? '').trim()
  return !text || text.toLowerCase().startsWith(UNREADABLE_PREFIX)
}

function applicationName(item: ApplicationCard) {
  const title = item.title?.trim() || item.label?.trim() || 'Untitled application'
  const company = item.company?.trim()
  return company ? `${title} at ${company}` : title
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
      if (isUnreadable(data.job_description)) {
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
              Some job sites block automated readers. Paste the job description text below instead; what you
              already had there is untouched.
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
                    {applications.isPending ? 'Loading your applications…' : applications.data?.items.length === 0 ? 'No applications yet' : 'Select an application'}
                  </option>
                  {applications.data?.items.map((item) => (
                    <option key={item.id} value={item.id}>{applicationName(item)}</option>
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

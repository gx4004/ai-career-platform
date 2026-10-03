import { useState } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { Button, Checkbox, Field, Input, Notice, Section, Select, Stack, Textarea } from '#/components/kit'
import { getHistoryWorkspaces, importJobText, importJobUrl } from '#/lib/api/client'

/** Fill the job description from a posting URL, and optionally attach the listing to an application. */
export function JobImportCard({
  onImported,
}: {
  onImported: (description: string) => void
}) {
  const [url, setUrl] = useState('')
  const [attach, setAttach] = useState(false)
  const [campaignId, setCampaignId] = useState('')
  const [title, setTitle] = useState('')
  const [company, setCompany] = useState('')
  const [description, setDescription] = useState('')
  const campaigns = useQuery({
    queryKey: ['history-workspaces', 'listing-attach'],
    queryFn: getHistoryWorkspaces,
    enabled: attach,
  })
  const mutation = useMutation({
    mutationFn: importJobUrl,
    onSuccess: (data) => {
      onImported(data.job_description)
    },
  })
  const pasteMutation = useMutation({
    mutationFn: importJobText,
    onSuccess: (data) => onImported(data.job_description),
  })

  return (
    <Stack gap={3}>
      <Field
        label="Import from job URL"
        optional
        id="job-import-url"
        error={
          mutation.error
            ? mutation.error instanceof Error
              ? mutation.error.message
              : 'Job import failed.'
            : undefined
        }
      >
        <Input
          inputMode="url"
          autoComplete="off"
          value={url}
          onChange={(event) => setUrl(event.target.value)}
          placeholder="Paste the job posting URL"
          trailing={
            <Button
              type="button"
              variant="secondary"
              size="sm"
              loading={mutation.isPending}
              onClick={() =>
                mutation.mutate({
                  url,
                  ...(attach && campaignId ? { campaign_id: campaignId } : {}),
                })
              }
              disabled={!url.trim() || (attach && !campaignId)}
            >
              Import
            </Button>
          }
        />
      </Field>
      <Checkbox
        id="campaign-attach-toggle"
        label="Attach to one of your applications"
        checked={attach}
        onCheckedChange={setAttach}
      />
      {attach ? (
        <Stack gap={4} className="tool-attach" role="group" aria-label="Application listing attachment">
          <Field label="Application" id="campaign-listing-picker">
            <Select value={campaignId} onChange={(event) => setCampaignId(event.target.value)}>
              <option value="">Select an application</option>
              {campaigns.data?.items.map((item) => (
                <option key={item.id} value={item.id}>{item.label || item.role || 'Untitled application'}</option>
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
          {campaigns.error || pasteMutation.error ? <Notice tone="danger">Could not attach the listing.</Notice> : null}
        </Stack>
      ) : null}
    </Stack>
  )
}

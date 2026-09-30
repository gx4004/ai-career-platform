import { useState } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { Button } from '#/components/ui/button'
import { Input } from '#/components/ui/input'
import { getHistoryWorkspaces, importJobText, importJobUrl } from '#/lib/api/client'

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
    <div className="import-card">
      <div className="tool-field">
        <div className="tool-field-head">
          <label className="tool-field-label" htmlFor="job-import-url">
            <span>Import from job URL</span>
            <span className="tool-field-meta">Optional</span>
          </label>
        </div>
        <div className="import-card-row">
          <Input
            id="job-import-url"
            value={url}
            onChange={(event) => setUrl(event.target.value)}
            placeholder="Paste the job posting URL"
          />
          <Button
            type="button"
            variant="outline"
            onClick={() => mutation.mutate({
              url,
              ...(attach && campaignId ? { campaign_id: campaignId } : {}),
            })}
            disabled={mutation.isPending || !url.trim() || (attach && !campaignId)}
          >
            {mutation.isPending ? 'Importing…' : 'Import'}
          </Button>
        </div>
        {mutation.error ? (
          <p className="tool-field-error">
            {mutation.error instanceof Error ? mutation.error.message : 'Job import failed.'}
          </p>
        ) : null}
        <label className="import-card-attach" htmlFor="campaign-attach-toggle">
          <input
            id="campaign-attach-toggle"
            type="checkbox"
            checked={attach}
            onChange={(event) => setAttach(event.target.checked)}
          />
          Attach to one of your applications
        </label>
        {attach ? (
          <div className="import-card-panel grid gap-3" aria-label="Application listing attachment">
            <div className="workspace-picker">
              <label className="workspace-picker-label" htmlFor="campaign-listing-picker">Application</label>
              <select
                id="campaign-listing-picker"
                className="workspace-picker-select"
                value={campaignId}
                onChange={(event) => setCampaignId(event.target.value)}
              >
                <option value="">Select an application</option>
                {campaigns.data?.items.map((item) => (
                  <option key={item.id} value={item.id}>{item.label || item.role || 'Untitled application'}</option>
                ))}
              </select>
            </div>
            <p className="tool-field-note">Or attach a pasted listing</p>
            <div className="grid gap-1">
              <label className="tool-field-note" htmlFor="campaign-job-title">Job title</label>
              <Input id="campaign-job-title" value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Job title" maxLength={200} />
            </div>
            <div className="grid gap-1">
              <label className="tool-field-note" htmlFor="campaign-job-company">Company</label>
              <Input id="campaign-job-company" value={company} onChange={(event) => setCompany(event.target.value)} placeholder="Company" maxLength={200} />
            </div>
            <div className="grid gap-1">
              <label className="tool-field-note" htmlFor="campaign-job-description">Job description</label>
              <textarea
                id="campaign-job-description"
                className="import-card-textarea"
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                placeholder="Paste the job description"
                maxLength={20_000}
              />
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => pasteMutation.mutate({ campaign_id: campaignId, job_title: title, company_name: company, job_description: description })}
              disabled={pasteMutation.isPending || !campaignId || !title.trim() || !company.trim() || description.trim().length < 20}
            >
              {pasteMutation.isPending ? 'Attaching…' : 'Attach pasted listing'}
            </Button>
            {campaigns.error || pasteMutation.error ? <p className="tool-field-error">Could not attach the listing.</p> : null}
          </div>
        ) : null}
      </div>
    </div>
  )
}

import { useState } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { Link2 } from 'lucide-react'
import { Button } from '#/components/ui/button'
import { Input } from '#/components/ui/input'
import { getHistoryWorkspaces, importJobText, importJobUrl } from '#/lib/api/client'
import { isR13CampaignsEnabled } from '#/lib/flags/featureFlags'

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
    <div className="import-card p-4">
      <div className="grid gap-3">
        <div className="flex items-center gap-2">
          <Link2 size={16} style={{ color: 'var(--text-muted)' }} />
          <p className="section-title">Import from job URL</p>
        </div>
        <div className="flex flex-col gap-3 sm:flex-row">
          <Input
            value={url}
            onChange={(event) => setUrl(event.target.value)}
            placeholder="Paste the job posting URL"
          />
          <Button
            type="button"
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
          <p className="small-copy" style={{ color: 'var(--destructive)' }}>
            {mutation.error instanceof Error ? mutation.error.message : 'Job import failed.'}
          </p>
        ) : null}
        {/* R13 campaigns ships dark until the full R11-R13 chain is enabled
            (see docs/agents/domain.md); the attach-to-campaign affordance stays
            hidden and inert until then. */}
        {isR13CampaignsEnabled() ? (
          <>
            <label className="import-card-attach small-copy" htmlFor="campaign-attach-toggle">
              <input
                id="campaign-attach-toggle"
                type="checkbox"
                checked={attach}
                onChange={(event) => setAttach(event.target.checked)}
              />
              Attach explicitly to a campaign
            </label>
            {attach ? (
              <div className="import-card-panel grid gap-3" aria-label="Campaign listing attachment">
                <div className="workspace-picker">
                  <label className="workspace-picker-label" htmlFor="campaign-listing-picker">Campaign</label>
                  <select
                    id="campaign-listing-picker"
                    className="workspace-picker-select"
                    value={campaignId}
                    onChange={(event) => setCampaignId(event.target.value)}
                  >
                    <option value="">Select a campaign</option>
                    {campaigns.data?.items.map((item) => (
                      <option key={item.id} value={item.id}>{item.label || item.role || 'Untitled campaign'}</option>
                    ))}
                  </select>
                </div>
                <p className="small-copy">Or attach a pasted listing</p>
                <div className="grid gap-1">
                  <label className="small-copy" htmlFor="campaign-job-title">Job title</label>
                  <Input id="campaign-job-title" value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Job title" maxLength={200} />
                </div>
                <div className="grid gap-1">
                  <label className="small-copy" htmlFor="campaign-job-company">Company</label>
                  <Input id="campaign-job-company" value={company} onChange={(event) => setCompany(event.target.value)} placeholder="Company" maxLength={200} />
                </div>
                <div className="grid gap-1">
                  <label className="small-copy" htmlFor="campaign-job-description">Job description</label>
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
                  onClick={() => pasteMutation.mutate({ campaign_id: campaignId, job_title: title, company_name: company, job_description: description })}
                  disabled={pasteMutation.isPending || !campaignId || !title.trim() || !company.trim() || description.trim().length < 20}
                >
                  {pasteMutation.isPending ? 'Attaching…' : 'Attach pasted listing'}
                </Button>
                {campaigns.error || pasteMutation.error ? <p className="small-copy" style={{ color: 'var(--destructive)' }}>Could not attach the listing.</p> : null}
              </div>
            ) : null}
          </>
        ) : null}
      </div>
    </div>
  )
}

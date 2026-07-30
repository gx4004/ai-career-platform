import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useNavigate } from '@tanstack/react-router'
import { CalendarDays, ExternalLink, FileText, LockKeyhole, Trash2 } from 'lucide-react'
import { AppStatePanel } from '#/components/app/AppStatePanel'
import { PageFrame } from '#/components/app/PageFrame'
import { Button } from '#/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '#/components/ui/dialog'
import { Skeleton } from '#/components/ui/skeleton'
import { useSession } from '#/hooks/useSession'
import { deleteCampaign, getCampaign, updateCampaignMaterials } from '#/lib/api/client'
import type { CampaignMaterialSelection } from '#/lib/api/schemas'
import { CampaignTracking } from './CampaignTracking'
import { CampaignReminders } from './CampaignReminders'
import { CampaignReviewer } from './CampaignReviewer'

type SelectionKey = keyof CampaignMaterialSelection

export function CampaignPage({ campaignId }: { campaignId: string }) {
  const { status, openAuthDialog } = useSession()
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const [deleteOpen, setDeleteOpen] = useState(false)
  const authenticated = status === 'authenticated'
  const query = useQuery({
    queryKey: ['campaign', campaignId], queryFn: () => getCampaign(campaignId), enabled: authenticated,
  })
  const mutation = useMutation({
    mutationFn: (payload: CampaignMaterialSelection) => updateCampaignMaterials(campaignId, payload),
    onSuccess: (campaign) => {
      queryClient.setQueryData(['campaign', campaignId], campaign)
      void queryClient.invalidateQueries({ queryKey: ['history-workspaces'] })
    },
  })
  const refresh = () => queryClient.invalidateQueries({ queryKey: ['campaign', campaignId] })
  const deleteMutation = useMutation({
    mutationFn: () => deleteCampaign(campaignId),
    onSuccess: () => {
      queryClient.removeQueries({ queryKey: ['campaign', campaignId] })
      void queryClient.invalidateQueries({ queryKey: ['history-workspaces'] })
      void navigate({ to: '/history' })
    },
  })

  if (status === 'loading') return <CampaignSkeleton />
  if (!authenticated) return <PageFrame><AppStatePanel badge="Account only" title="Sign in to open this campaign" description="Campaign listings and selected materials stay private to their owner." icon={<LockKeyhole aria-hidden="true" />} actions={[{ label: 'Sign in', onClick: () => openAuthDialog({ to: `/campaigns/${campaignId}`, reason: 'campaign' }) }]} /></PageFrame>
  if (query.isPending) return <CampaignSkeleton />
  if (query.isError || !query.data) return <PageFrame><AppStatePanel badge="Campaign unavailable" title="This campaign could not be opened" description="It may have been removed or belong to another account." actions={[{ label: 'Back to history', to: '/history', variant: 'outline' }]} /></PageFrame>

  const campaign = query.data
  return <PageFrame className="campaign-page">
    <header className="campaign-hero">
      <div>
        <Link to="/history" className="campaign-back">History / Campaign</Link>
        <p className="eyebrow">Application campaign</p>
        <h1 className="page-title">{campaign.role || campaign.label || 'Untitled role'}</h1>
        <p className="campaign-company">{campaign.company || 'Company not set'}</p>
      </div>
      <div className="campaign-meta" aria-label="Campaign details">
        <span className="campaign-status">{campaign.status?.replace('-', ' ') || 'Not started'}</span>
        <span><CalendarDays aria-hidden="true" />{campaign.deadline ? new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }).format(new Date(campaign.deadline)) : 'No deadline'}</span>
      </div>
    </header>

    <div className="campaign-layout">
      <main className="campaign-listing" aria-labelledby="listing-title">
        <div className="campaign-section-heading"><div><p className="eyebrow">Canonical source</p><h2 id="listing-title">Target listing</h2></div>{campaign.listing?.source_url ? <a href={campaign.listing.source_url} target="_blank" rel="noreferrer">Open source <ExternalLink aria-hidden="true" /></a> : null}</div>
        {campaign.listing ? <><div className="campaign-listing-title"><strong>{campaign.listing.title}</strong><span>{campaign.listing.company}</span></div><p className="campaign-description">{campaign.listing.description}</p><p className="small-copy muted-copy">Retrieved {new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }).format(new Date(campaign.listing.retrieved_at))}</p></> : <div className="campaign-empty"><FileText aria-hidden="true" /><h3>No canonical listing yet</h3><p>Attach the exact posting from a job tool to keep this campaign grounded.</p></div>}
      </main>
      <aside className="campaign-materials" aria-labelledby="materials-title">
        <p className="eyebrow">Exact versions</p><h2 id="materials-title">Selected materials</h2><p className="small-copy muted-copy">Selections point to immutable versions. Their content is never copied into the campaign.</p>
        <MaterialSelect label="CV variant" field="cv_variant_id" value={campaign.selected_materials.cv_variant?.id || ''} items={campaign.available_materials.cv_variants.map(item => ({ id: item.id, label: `${item.document_name} — ${item.name}` }))} empty="No CV variants available" pending={mutation.isPending} onChange={value => mutation.mutate({ cv_variant_id: value || null })} />
        <MaterialSelect label="Cover letter revision" field="cover_letter_run_id" value={campaign.selected_materials.cover_letter?.id || ''} items={campaign.available_materials.cover_letters.map(item => ({ id: item.id, label: runLabel(item) }))} empty="No cover letters available" pending={mutation.isPending} onChange={value => mutation.mutate({ cover_letter_run_id: value || null })} />
        <MaterialSelect label="Interview preparation revision" field="interview_run_id" value={campaign.selected_materials.interview?.id || ''} items={campaign.available_materials.interviews.map(item => ({ id: item.id, label: runLabel(item) }))} empty="No interview preparation available" pending={mutation.isPending} onChange={value => mutation.mutate({ interview_run_id: value || null })} />
        <p className="small-copy muted-copy" role="status" aria-live="polite">{mutation.isPending ? 'Saving selection…' : mutation.isSuccess ? 'Selection saved.' : ''}</p>
        {mutation.isError ? <p className="campaign-error" role="alert">The selection could not be saved. Try again.</p> : null}
      </aside>
    </div>
    <CampaignTracking campaign={campaign} campaignId={campaignId} refresh={refresh} onRequestDelete={() => setDeleteOpen(true)} />
    <CampaignReminders campaignId={campaignId} />
    <CampaignReviewer campaignId={campaignId} />
    <Dialog open={deleteOpen} onOpenChange={(open) => { if (!deleteMutation.isPending) setDeleteOpen(open) }}>
      <DialogContent showCloseButton={!deleteMutation.isPending}>
        <DialogHeader>
          <DialogTitle>Delete this campaign?</DialogTitle>
          <DialogDescription>This permanently removes the campaign, its product-held submission confirmations, timeline, and retained snapshots. It cannot withdraw or recall the employer-held application.</DialogDescription>
        </DialogHeader>
        {deleteMutation.isError ? <p role="alert" className="campaign-error">The campaign could not be deleted. Try again.</p> : null}
        <DialogFooter>
          <Button variant="outline" disabled={deleteMutation.isPending} onClick={() => setDeleteOpen(false)}>Cancel</Button>
          <Button variant="outline" className="button-destructive-soft" loading={deleteMutation.isPending} disabled={deleteMutation.isPending} onClick={() => deleteMutation.mutate()}><Trash2 size={14} className="mr-1.5" />{deleteMutation.isPending ? 'Deleting…' : 'Delete campaign'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </PageFrame>
}

function MaterialSelect({ label, field, value, items, empty, pending, onChange }: { label: string; field: SelectionKey; value: string; items: Array<{ id: string; label: string }>; empty: string; pending: boolean; onChange: (value: string) => void }) {
  const id = `campaign-${field}`
  return <div className="campaign-material-field"><label htmlFor={id}>{label}</label><select id={id} value={value} disabled={pending || items.length === 0} onChange={event => onChange(event.target.value)}><option value="">{items.length ? 'No selection' : empty}</option>{items.map(item => <option key={item.id} value={item.id}>{item.label}</option>)}</select><p>{value ? 'Exact saved version selected' : 'Nothing selected yet'}</p></div>
}

function runLabel(run: { id: string; label: string | null; parent_run_id: string | null; created_at: string }) { return `${run.label || 'Untitled material'} — ${run.parent_run_id ? 'revision' : 'original'} · ${new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }).format(new Date(run.created_at))} · ${run.id.slice(0, 8)}` }
function CampaignSkeleton() { return <PageFrame className="campaign-page" aria-busy="true"><div className="campaign-hero"><div className="grid gap-3"><Skeleton className="h-4 w-28" /><Skeleton className="h-10 w-72 max-w-full" /><Skeleton className="h-5 w-40" /></div></div><div className="campaign-layout"><Skeleton className="h-[32rem] w-full" /><Skeleton className="h-[26rem] w-full" /></div></PageFrame> }

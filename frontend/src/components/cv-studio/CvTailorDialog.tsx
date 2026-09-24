import { useEffect, useId, useState } from 'react'
import { ArrowRight, Check, Info, Sparkles, X } from 'lucide-react'
import { Button } from '#/components/ui/button'
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '#/components/ui/dialog'
import { applyCvTailoring, tailorCvDocument } from '#/lib/api/client'
import type { CvTailoringChange, CvTailoringProposal, CvVariant } from '#/lib/api/schemas'
import { cn } from '#/lib/utils'

type Decision = 'accept' | 'reject'

function ChangeCard({ change, decision, onDecide }: {
  change: CvTailoringChange; decision: Decision | undefined; onDecide: (decision: Decision) => void
}) {
  const blocked = change.support === 'unsupported'
  return (
    <article className={cn('cvs-diff', blocked && 'is-blocked', decision === 'accept' && 'is-accepted', decision === 'reject' && 'is-rejected')} aria-label={`Suggestion for ${change.job_requirement}`}>
      <p className="cvs-diff__why"><span>For this job:</span> {change.job_requirement}</p>
      <div className="cvs-diff__compare">
        <div className="cvs-diff__side cvs-diff__side--before">
          <p className="cvs-diff__tag">Now</p>
          <p>{change.before}</p>
        </div>
        <ArrowRight className="cvs-diff__arrow" size={16} aria-hidden="true" />
        <div className="cvs-diff__side cvs-diff__side--after">
          <p className="cvs-diff__tag">Suggested</p>
          <p>{change.after}</p>
        </div>
      </div>
      {blocked ? (
        <p className="cvs-diff__note"><Info size={14} aria-hidden="true" /> We can’t back this up yet. Add and confirm it in your Evidence, then generate again.</p>
      ) : (
        <div className="cvs-diff__footer">
          <p className="cvs-diff__source">{change.support === 'confirmed' ? 'Based on facts you confirmed in your Evidence' : 'Reworded from what your CV already says'}</p>
          <div className="cvs-diff__actions" role="group" aria-label="Your decision">
            <Button type="button" size="sm" variant={decision === 'reject' ? 'secondary' : 'ghost'} aria-pressed={decision === 'reject'} onClick={() => onDecide('reject')}>
              <X size={14} /> Keep mine
            </Button>
            <Button type="button" size="sm" variant={decision === 'accept' ? 'default' : 'outline'} aria-pressed={decision === 'accept'} onClick={() => onDecide('accept')}>
              <Check size={14} /> Use suggestion
            </Button>
          </div>
        </div>
      )}
    </article>
  )
}

export function CvTailorDialog({ open, onOpenChange, documentId, canGenerate, remainingRuns, onSaved, onGenerated, seed }: {
  open: boolean
  onOpenChange: (open: boolean) => void
  documentId: string
  /** False while the editor still has unsaved changes. */
  canGenerate: boolean
  remainingRuns: number
  onSaved: (variant: CvVariant) => void
  onGenerated: () => void
  /** Prefills the form when the dialog is opened for a job carried over from Job Discovery. */
  seed?: { jobTitle: string; jobDescription: string } | null
}) {
  const titleId = useId()
  const descriptionId = useId()
  const versionId = useId()
  const [jobTitle, setJobTitle] = useState('')
  const [jobDescription, setJobDescription] = useState('')
  const [proposal, setProposal] = useState<CvTailoringProposal | null>(null)
  const [decisions, setDecisions] = useState<Record<string, Decision>>({})
  const [versionName, setVersionName] = useState('')
  const [state, setState] = useState<'idle' | 'generating' | 'saving'>('idle')
  const [error, setError] = useState('')

  useEffect(() => { if (!open) setError('') }, [open])

  // Prefill from a job carried over from Job Discovery when the dialog opens
  // with a seed — never mid-session, so it can't clobber what someone typed.
  useEffect(() => {
    if (open && seed) {
      setJobTitle(seed.jobTitle)
      setJobDescription(seed.jobDescription)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only react to `open` toggling on
  }, [open])

  async function generate() {
    setState('generating'); setError('')
    try {
      const next = await tailorCvDocument(documentId, { job_title: jobTitle.trim(), job_description: jobDescription.trim() })
      setProposal(next)
      setDecisions({})
      setVersionName(`${next.job_title} version`.slice(0, 120))
      onGenerated()
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Tailoring isn’t available right now.')
    } finally {
      setState('idle')
    }
  }

  async function save() {
    if (!proposal) return
    setState('saving'); setError('')
    try {
      const variant = await applyCvTailoring(documentId, {
        request_id: proposal.request_id,
        variant_name: versionName.trim(),
        job_title: proposal.job_title,
        proposal_token: proposal.proposal_token,
        changes: proposal.changes,
        decisions: proposal.changes.map((change) => ({ change_id: change.id, action: decisions[change.id] ?? 'reject' })),
      })
      onSaved(variant)
      setProposal(null)
      setDecisions({})
      onOpenChange(false)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'The version wasn’t saved.')
    } finally {
      setState('idle')
    }
  }

  const accepted = proposal ? proposal.changes.filter((change) => decisions[change.id] === 'accept').length : 0
  const remaining = proposal?.remaining_regenerations ?? remainingRuns
  const skipped = proposal?.skipped.length ?? 0
  const canSubmit = canGenerate && jobTitle.trim().length > 0 && jobDescription.trim().length >= 20 && remaining > 0

  return (
    <Dialog open={open} onOpenChange={(next) => state === 'idle' && onOpenChange(next)}>
      <DialogContent className="cvs-tailor sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>Tailor to a job</DialogTitle>
          <DialogDescription>
            Paste the job you’re applying for. We’ll suggest wording changes you can take or leave, then save the result as a new version. Your current CV stays as it is.
          </DialogDescription>
        </DialogHeader>

        <div className="cvs-tailor__body">
          <div className="cvs-tailor__form">
            <div className="cvs-field">
              <label htmlFor={titleId}>Job title</label>
              <input id={titleId} className="cvs-input" value={jobTitle} maxLength={200} placeholder="e.g. Senior Product Designer" onChange={(event) => setJobTitle(event.target.value)} />
            </div>
            <div className="cvs-field">
              <label htmlFor={descriptionId}>Job description</label>
              <textarea id={descriptionId} className="cvs-textarea" rows={proposal ? 3 : 7} maxLength={50_000} value={jobDescription} placeholder="Paste the full job ad here." onChange={(event) => setJobDescription(event.target.value)} />
            </div>
            <div className="cvs-tailor__generate">
              <Button type="button" loading={state === 'generating'} disabled={!canSubmit || state !== 'idle'} onClick={() => void generate()}>
                <Sparkles size={16} /> {proposal ? 'Suggest again' : 'Suggest changes'}
              </Button>
              <span className="cvs-tailor__quota">{remaining} {remaining === 1 ? 'suggestion run' : 'suggestion runs'} left for this CV</span>
            </div>
            {!canGenerate ? <p className="cvs-tailor__hint" role="status">Saving your latest edits first…</p> : null}
          </div>

          {error ? <p role="alert" className="cvs-inline-error">{error} Your CV hasn’t changed.</p> : null}

          {proposal ? (
            <div className="cvs-tailor__review">
              <p className="cvs-tailor__summary">
                {proposal.changes.length === 0
                  ? 'Your CV already fits this job well. We didn’t find anything worth changing.'
                  : `${proposal.changes.length} ${proposal.changes.length === 1 ? 'suggestion' : 'suggestions'} for ${proposal.job_title}. Nothing changes unless you choose “Use suggestion”.`}
              </p>
              {skipped > 0 ? (
                <p className="cvs-tailor__skipped" role="status">
                  <Info size={14} aria-hidden="true" /> We left out {skipped} {skipped === 1 ? 'suggestion' : 'suggestions'} because that part of your CV changed while we were working. Suggest again to include {skipped === 1 ? 'it' : 'them'}.
                </p>
              ) : null}
              <div className="cvs-diff-list">
                {proposal.changes.map((change) => (
                  <ChangeCard key={change.id} change={change} decision={decisions[change.id]} onDecide={(decision) => setDecisions((current) => ({ ...current, [change.id]: decision }))} />
                ))}
              </div>
            </div>
          ) : null}
        </div>

        {proposal && proposal.changes.length > 0 ? (
          <DialogFooter className="cvs-tailor__footer">
            <div className="cvs-field cvs-tailor__version">
              <label htmlFor={versionId}>Save as version</label>
              <input id={versionId} className="cvs-input" value={versionName} maxLength={120} onChange={(event) => setVersionName(event.target.value)} />
            </div>
            <Button type="button" loading={state === 'saving'} disabled={accepted === 0 || !versionName.trim() || state !== 'idle'} onClick={() => void save()}>
              Save version{accepted > 0 ? ` with ${accepted} ${accepted === 1 ? 'change' : 'changes'}` : ''}
            </Button>
          </DialogFooter>
        ) : null}
      </DialogContent>
    </Dialog>
  )
}

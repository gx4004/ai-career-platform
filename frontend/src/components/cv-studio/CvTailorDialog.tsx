import { useEffect, useState } from 'react'
import { Check, X } from 'lucide-react'
import {
  Badge, Button, Card, CardHeader, CardTitle, Cluster, Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter,
  DialogHeader, DialogTitle, Field, Input, KeyValue, Notice, Stack, Textarea,
} from '#/components/kit'
import { applyCvTailoring, tailorCvDocument } from '#/lib/api/client'
import type { CvTailoringChange, CvTailoringProposal, CvVariant } from '#/lib/api/schemas'

type Decision = 'accept' | 'reject'

function ChangeCard({ change, decision, onDecide }: {
  change: CvTailoringChange; decision: Decision | undefined; onDecide: (decision: Decision) => void
}) {
  const blocked = change.support === 'unsupported'
  return (
    // A used suggestion takes the soft selected fill, so its pressed (lemon) "Use suggestion" still reads on it.
    <Card tone={decision === 'accept' ? 'lemon' : undefined} aria-label={`Suggestion for ${change.job_requirement}`}>
      <CardHeader>
        <CardTitle headingLevel={4}>For this job: {change.job_requirement}</CardTitle>
      </CardHeader>
      <KeyValue
        divided={false}
        labelWidth="6rem"
        items={[
          { label: 'Now', value: <span className="cvs-prewrap">{change.before}</span> },
          { label: 'Suggested', value: <span className="cvs-prewrap">{change.after}</span> },
        ]}
      />
      {blocked ? (
        <Notice>We can’t back this up yet. Add it to your profile and save it, then generate again.</Notice>
      ) : (
        <Cluster justify="between" gap={3}>
          <Badge tone={change.support === 'confirmed' ? 'success' : 'neutral'} size="sm">
            {change.support === 'confirmed' ? 'Based on facts you saved on your profile' : 'Reworded from what your CV already says'}
          </Badge>
          <Cluster gap={2} role="group" aria-label="Your decision">
            <Button type="button" size="sm" variant="secondary" aria-pressed={decision === 'reject'} onClick={() => onDecide('reject')}>
              <X aria-hidden="true" /> Keep mine
            </Button>
            <Button type="button" size="sm" variant="secondary" aria-pressed={decision === 'accept'} onClick={() => onDecide('accept')}>
              <Check aria-hidden="true" /> Use suggestion
            </Button>
          </Cluster>
        </Cluster>
      )}
    </Card>
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
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="lg" dismissible={state === 'idle'}>
        <DialogHeader>
          <DialogTitle>Tailor to a job</DialogTitle>
          <DialogDescription>
            Paste the job you’re applying for. We’ll suggest wording changes you can take or leave, then save the result as a new version. Your current CV stays as it is.
          </DialogDescription>
        </DialogHeader>

        <DialogBody>
          <Stack gap={6}>
            <Stack gap={4}>
              <Field label="Job title">
                <Input value={jobTitle} maxLength={200} placeholder="e.g. Senior Product Designer" onChange={(event) => setJobTitle(event.target.value)} />
              </Field>
              <Field label="Job description">
                <Textarea autosize maxRows={proposal ? 4 : 12} rows={proposal ? 3 : 7} maxLength={50_000} value={jobDescription} placeholder="Paste the full job ad here." onChange={(event) => setJobDescription(event.target.value)} />
              </Field>
              <Cluster gap={3}>
                <Button type="button" variant={proposal ? 'secondary' : 'primary'} loading={state === 'generating'} disabled={!canSubmit || state !== 'idle'} onClick={() => void generate()}>
                  {proposal ? 'Suggest again' : 'Suggest changes'}
                </Button>
                <span className="cvs-hint">{remaining} {remaining === 1 ? 'suggestion run' : 'suggestion runs'} left for this CV</span>
              </Cluster>
              {!canGenerate ? <p className="cvs-hint" role="status">Saving your latest edits first…</p> : null}
            </Stack>

            {error ? <Notice tone="danger">{error} Your CV hasn’t changed.</Notice> : null}

            {proposal ? (
              <Stack gap={3}>
                <p>
                  {proposal.changes.length === 0
                    ? 'Your CV already fits this job well. We didn’t find anything worth changing.'
                    : `${proposal.changes.length} ${proposal.changes.length === 1 ? 'suggestion' : 'suggestions'} for ${proposal.job_title}. Nothing changes unless you choose “Use suggestion”.`}
                </p>
                {skipped > 0 ? (
                  <Notice role="status">
                    We left out {skipped} {skipped === 1 ? 'suggestion' : 'suggestions'} because that part of your CV changed while we were working. Suggest again to include {skipped === 1 ? 'it' : 'them'}.
                  </Notice>
                ) : null}
                {proposal.changes.map((change) => (
                  <ChangeCard key={change.id} change={change} decision={decisions[change.id]} onDecide={(decision) => setDecisions((current) => ({ ...current, [change.id]: decision }))} />
                ))}
              </Stack>
            ) : null}
          </Stack>
        </DialogBody>

        {proposal && proposal.changes.length > 0 ? (
          <DialogFooter className="cvs-tailor__footer">
            <Field label="Save as version" className="cvs-tailor__version">
              <Input value={versionName} maxLength={120} onChange={(event) => setVersionName(event.target.value)} />
            </Field>
            <Button type="button" loading={state === 'saving'} disabled={accepted === 0 || !versionName.trim() || state !== 'idle'} onClick={() => void save()}>
              Save version{accepted > 0 ? ` with ${accepted} ${accepted === 1 ? 'change' : 'changes'}` : ''}
            </Button>
          </DialogFooter>
        ) : null}
      </DialogContent>
    </Dialog>
  )
}

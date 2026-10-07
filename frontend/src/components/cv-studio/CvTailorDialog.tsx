import { useEffect, useRef, useState } from 'react'
import { Check, X } from 'lucide-react'
import {
  Badge, Button, Card, CardHeader, CardTitle, Cluster, Dialog, DialogBody, DialogClose, DialogContent, DialogDescription, DialogFooter,
  DialogHeader, DialogTitle, Field, Input, KeyValue, Notice, Stack, Textarea,
} from '#/components/kit'
import { useBreakpoint } from '#/hooks/use-breakpoint'
import { usePrefersReducedMotion } from '#/hooks/use-prefers-reduced-motion'
import { applyCvTailoring, tailorCvDocument } from '#/lib/api/client'
import type { CvTailoringChange, CvTailoringProposal, CvVariant } from '#/lib/api/schemas'
import { isVersionNameConflict, isVersionNameTaken, uniqueVersionName, versionNameTakenMessage } from './versionNames'

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
        // Kit badges never wrap: the provenance stays short enough to fit whole on its own line in a 320px dialog.
        <Cluster justify="between" gap={3}>
          <Badge tone={change.support === 'confirmed' ? 'success' : 'neutral'} size="sm">
            {change.support === 'confirmed' ? 'From facts on your profile' : 'Reworded from your CV'}
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

export function CvTailorDialog({ open, onOpenChange, documentId, canGenerate, remainingRuns, onSaved, onGenerated, seed, versionNames = [] }: {
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
  /** The CV's saved version names: the suggested name avoids them ("<job> version 2"). */
  versionNames?: readonly string[]
}) {
  const [jobTitle, setJobTitle] = useState('')
  const [jobDescription, setJobDescription] = useState('')
  const [proposal, setProposal] = useState<CvTailoringProposal | null>(null)
  const [decisions, setDecisions] = useState<Record<string, Decision>>({})
  const [versionName, setVersionName] = useState('')
  const [state, setState] = useState<'idle' | 'generating' | 'saving'>('idle')
  const [error, setError] = useState('')
  /** The name is taken: said at the field, which gets the cursor. */
  const [nameError, setNameError] = useState('')
  const versionInputRef = useRef<HTMLInputElement>(null)
  // On a phone the field ends the scrolling body: bring its error up from under the footer too, not just the input.
  useEffect(() => {
    if (nameError) versionInputRef.current?.closest('.kit-field')?.scrollIntoView?.({ block: 'nearest' })
  }, [nameError])

  /**
   * The run in flight. Closing the dialog (or the studio unmounting) stops it and forgets it: its late answer must not
   * fill a dialog the user left (cv-studio-G19). The server counted the run when it started, so the count is refreshed.
   */
  const runRef = useRef<{ controller: AbortController } | null>(null)
  const abandonRun = () => {
    const run = runRef.current
    if (!run) return false
    runRef.current = null
    run.controller.abort()
    return true
  }
  useEffect(() => () => { abandonRun() }, [])

  useEffect(() => {
    if (open) return
    setError(''); setNameError('')
    if (abandonRun()) {
      setState('idle')
      onGenerated()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only when the dialog closes
  }, [open])

  // Fresh suggestions are what the user came for: bring them to the top of the dialog's scrolling body, which on a
  // phone is otherwise still showing the job description and Suggest again.
  const resultsRef = useRef<HTMLDivElement>(null)
  const reduceMotion = usePrefersReducedMotion()
  const proposalId = proposal?.request_id
  useEffect(() => {
    if (proposalId) resultsRef.current?.scrollIntoView?.({ block: 'start', behavior: reduceMotion ? 'auto' : 'smooth' })
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only when a new proposal arrives
  }, [proposalId])

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
    abandonRun()
    const run = { controller: new AbortController() }
    runRef.current = run
    setState('generating'); setError('')
    try {
      const next = await tailorCvDocument(documentId, { job_title: jobTitle.trim(), job_description: jobDescription.trim() }, { signal: run.controller.signal })
      if (runRef.current !== run) return
      setProposal(next)
      setDecisions({})
      setVersionName(uniqueVersionName(`${next.job_title} version`, versionNames))
      setNameError('')
      onGenerated()
    } catch (caught) {
      if (runRef.current !== run) return
      setError(caught instanceof Error ? caught.message : 'Tailoring isn’t available right now.')
    } finally {
      if (runRef.current === run) {
        runRef.current = null
        setState('idle')
      }
    }
  }

  async function save() {
    if (!proposal) return
    if (isVersionNameTaken(versionName, versionNames)) {
      setNameError(versionNameTakenMessage(versionName))
      versionInputRef.current?.focus()
      return
    }
    setState('saving'); setError(''); setNameError('')
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
      if (isVersionNameConflict(caught)) {
        setNameError(versionNameTakenMessage(versionName))
        versionInputRef.current?.focus()
      } else setError(caught instanceof Error ? caught.message : 'The version wasn’t saved.')
    } finally {
      setState('idle')
    }
  }

  const accepted = proposal ? proposal.changes.filter((change) => decisions[change.id] === 'accept').length : 0
  // Runs only go up, so the lower count is the newer one: a run closed mid-way still counts (cv-studio-G19).
  const remaining = Math.min(proposal?.remaining_regenerations ?? remainingRuns, remainingRuns)
  const skipped = proposal?.skipped.length ?? 0
  // On a phone the footer stays one button high, so the suggestions get the room: the name field ends the body.
  const phone = useBreakpoint() === 'mobile'
  const changesLine = `${accepted} ${accepted === 1 ? 'change' : 'changes'}`
  const versionField = (
    // A phone's full-width Save says only "Save version" (with the count it wrapped to two lines at 320,
    // cv-studio-G12): the count is told here, under the name, beside the suggestions it counts.
    <Field
      label="Save as version" className="cvs-tailor__version" error={nameError || undefined}
      help={phone ? (accepted > 0 ? `${changesLine} will be saved.` : 'Use a suggestion to save it in a version.') : undefined}
    >
      <Input ref={versionInputRef} value={versionName} maxLength={120} onChange={(event) => { setVersionName(event.target.value); setNameError('') }} />
    </Field>
  )
  const canSubmit = canGenerate && jobTitle.trim().length > 0 && jobDescription.trim().length >= 20 && remaining > 0
  const suggestButton = (
    // Loading keeps the button's fill and shadow (it must not look disabled); the kit blocks clicks while it loads
    // (cv-studio-G07).
    // It also says "Suggesting…" on itself: on a phone the status line under the fields is below the fold (cv-studio-G18).
    <Button
      type="button" variant={proposal ? 'secondary' : 'primary'} loading={state === 'generating'} loadingLabel="Suggesting…"
      disabled={!canSubmit || state === 'saving'} onClick={() => void generate()}
    >
      {proposal ? 'Suggest again' : 'Suggest changes'}
    </Button>
  )
  const runsLeft = (
    <Stack gap={1}>
      <span className="cvs-hint">{remaining} {remaining === 1 ? 'suggestion run' : 'suggestion runs'} left for this CV</span>
      {/* Closing is allowed while it works; the server counted the run when it started (cv-studio-G19). */}
      {state === 'generating' ? <p className="cvs-hint" role="status">Reading the job and your CV… Closing now won’t give this run back.</p> : null}
    </Stack>
  )

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {/* Generating can take minutes: the dialog stays closable (closing stops the run, cv-studio-G19). A save is short
          and must not be cut in half, so only a save holds it open. */}
      <DialogContent size="lg" dismissible={state !== 'saving'}>
        <DialogHeader>
          <DialogTitle>Tailor to a job</DialogTitle>
          <DialogDescription>We suggest wording changes for this job. Your CV stays as it is.</DialogDescription>
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
              {/* Step 1 submits from the footer like every form dialog; once suggestions are shown the footer saves
                  them, so asking again is a secondary beside the fields it re-reads (consistency-F14). */}
              {proposal ? (
                <Cluster gap={3}>
                  {suggestButton}
                  {runsLeft}
                </Cluster>
              ) : runsLeft}
              {!canGenerate ? <p className="cvs-hint" role="status">Saving your latest edits first…</p> : null}
            </Stack>

            {error ? <Notice tone="danger">{error} Your CV hasn’t changed.</Notice> : null}

            {proposal ? (
              <Stack gap={3} ref={resultsRef}>
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
                {phone && proposal.changes.length > 0 ? versionField : null}
              </Stack>
            ) : null}
          </Stack>
        </DialogBody>

        {/* Always a footer, Cancel then the one primary (consistency-F14). Nothing to save when the CV already fits:
            then only "Done" (as in CompleteSkillDialog; the corner X is already named "Close"). */}
        {proposal && proposal.changes.length > 0 ? (
          <DialogFooter className="cvs-tailor__footer">
            {phone ? null : versionField}
            <DialogClose asChild>
              <Button type="button" variant="secondary" disabled={state === 'saving'}>Cancel</Button>
            </DialogClose>
            <Button type="button" loading={state === 'saving'} disabled={accepted === 0 || !versionName.trim() || state === 'generating'} onClick={() => void save()}>
              Save version{accepted > 0 && !phone ? ` with ${changesLine}` : ''}
            </Button>
          </DialogFooter>
        ) : proposal ? (
          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="secondary" disabled={state === 'saving'}>Done</Button>
            </DialogClose>
          </DialogFooter>
        ) : (
          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="secondary" disabled={state === 'saving'}>Cancel</Button>
            </DialogClose>
            {suggestButton}
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  )
}

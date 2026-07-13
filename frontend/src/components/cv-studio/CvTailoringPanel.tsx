import { useState } from 'react'
import { Button } from '#/components/ui/button'
import { applyCvTailoring, proposeCvTailoringEdit, tailorCvDocument } from '#/lib/api/client'
import type { CvTailoringProposal } from '#/lib/api/schemas'

type Decision = { action: 'accept' | 'reject' | 'edit'; edited_after?: string }

export function CvTailoringPanel({ documentId, disabled, onApplied }: { documentId: string; disabled: boolean; onApplied: () => void }) {
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [proposal, setProposal] = useState<CvTailoringProposal | null>(null)
  const [decisions, setDecisions] = useState<Record<string, Decision>>({})
  const [state, setState] = useState<'idle' | 'loading' | 'applying' | 'error'>('idle')
  const [error, setError] = useState('')
  async function generate() {
    setState('loading'); setError('')
    try { setProposal(await tailorCvDocument(documentId, { job_title: title, job_description: description })); setDecisions({}); setState('idle') }
    catch (e) { setError(e instanceof Error ? e.message : 'Tailoring is unavailable.'); setState('error') }
  }
  async function apply() {
    if (!proposal) return
    setState('applying'); setError('')
    try {
      const customEdit = proposal.changes.find(change => decisions[change.id]?.action === 'edit' && ![change.before, change.after].includes(decisions[change.id]?.edited_after ?? ''))
      if (customEdit) {
        await proposeCvTailoringEdit(documentId, { request_id: proposal.request_id, job_title: proposal.job_title, proposal_token: proposal.proposal_token, changes: proposal.changes, change_id: customEdit.id, edited_after: decisions[customEdit.id].edited_after })
        setError('Your edited wording was saved as unconfirmed evidence. Confirm it in your Evidence Profile, then regenerate this proposal.')
        setState('error')
        return
      }
      await applyCvTailoring(documentId, { request_id: proposal.request_id, variant_name: `${proposal.job_title} — tailored`, job_title: proposal.job_title, proposal_token: proposal.proposal_token, changes: proposal.changes, decisions: proposal.changes.map(change => ({ change_id: change.id, ...(decisions[change.id] ?? { action: 'reject' }) })) })
      setProposal(null); setState('idle'); onApplied()
    } catch (e) { setError(e instanceof Error ? e.message : 'The variant was not created.'); setState('error') }
  }
  return <section className="studio-tailoring" aria-labelledby="studio-tailoring-title">
    <header><p className="eyebrow">Targeted application</p><h2 id="studio-tailoring-title">Evidence-grounded tailoring</h2><p>Attach a job, then review every proposed change before an immutable variant is created.</p></header>
    <label>Target job title<input value={title} maxLength={200} onChange={e => setTitle(e.target.value)} /></label>
    <label>Job description<textarea value={description} maxLength={50_000} rows={5} onChange={e => setDescription(e.target.value)} /></label>
    <Button type="button" disabled={disabled || title.trim().length < 1 || description.trim().length < 20 || state === 'loading'} onClick={() => void generate()}>{state === 'loading' ? 'Generating review…' : proposal ? 'Regenerate proposal' : 'Generate proposal'}</Button>
    {error ? <p role="alert" className="studio-inline-error">{error} Your document was not changed.</p> : null}
    {proposal ? <div className="studio-diffs"><p>{proposal.remaining_regenerations} tailored generations remain for this document.</p>{proposal.changes.length === 0 ? <p>No supported material changes were found.</p> : proposal.changes.map(change => <article key={change.id} className={change.support === 'unsupported' ? 'is-blocked' : ''}>
      <h3>{change.job_requirement}</h3><dl><div><dt>Before</dt><dd>{change.before}</dd></div><div><dt>After</dt><dd>{change.after}</dd></div></dl>
      <p>{change.support === 'confirmed' ? `Confirmed evidence: ${change.evidence_item_ids.join(', ')}` : change.support === 'document' ? 'Provenance: existing document content' : 'Blocked: confirm supporting evidence in your Evidence Profile, then regenerate.'}</p>
      {change.support !== 'unsupported' ? <fieldset><legend>Decision</legend>{(['accept', 'reject', 'edit'] as const).map(action => <label key={action}><input type="radio" name={`decision-${change.id}`} checked={decisions[change.id]?.action === action} onChange={() => setDecisions(current => ({ ...current, [change.id]: { action, ...(action === 'edit' ? { edited_after: change.after } : {}) } }))} />{action}</label>)}{decisions[change.id]?.action === 'edit' ? <><textarea aria-label={`Edit proposed wording for ${change.job_requirement}`} value={decisions[change.id].edited_after} onChange={e => setDecisions(current => ({ ...current, [change.id]: { action: 'edit', edited_after: e.target.value } }))} /><small>New edited wording is saved as unconfirmed evidence. Confirm it in your Evidence Profile, then regenerate before it can enter a variant.</small></> : null}</fieldset> : null}
    </article>)}</div> : null}
    {proposal ? <Button type="button" disabled={state === 'applying' || proposal.changes.every(c => (decisions[c.id]?.action ?? 'reject') === 'reject')} onClick={() => void apply()}>{state === 'applying' ? 'Creating variant…' : 'Create reviewed variant'}</Button> : null}
  </section>
}

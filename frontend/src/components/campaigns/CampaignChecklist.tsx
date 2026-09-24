import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { Check, CircleAlert, ClipboardCheck, ListPlus } from 'lucide-react'
import { WorkspacePanel } from '#/components/app/WorkspacePage'
import { Button } from '#/components/ui/button'
import { classifyCampaignGaps, getCampaignGapResponse, reviewCampaign } from '#/lib/api/client'
import { createDevelopmentItem } from '#/lib/api/development'
import type { GapClassification } from '#/lib/api/gapClassificationSchemas'
import type { CampaignDetail } from '#/lib/api/schemas'
import { isR17DevelopmentLoopEnabled } from '#/lib/flags/featureFlags'
import { GAP_KIND_LABELS, RESPONSE_KIND_LABELS, commercialRelationshipLabel } from '#/lib/development/plan'
import { DEVELOPMENT_PLAN_QUERY_KEY } from '#/lib/query/evidenceCaches'
import { PROVENANCE_LABELS, contentEntries } from '#/lib/profile/evidence'

type Finding = Awaited<ReturnType<typeof reviewCampaign>>['findings'][number]

const CHECKS: Array<{ category: Finding['category']; title: string; detail: string }> = [
  { category: 'unsupported_claim', title: 'Everything you claim is backed up', detail: 'Numbers, names and results also appear in your CV or profile.' },
  { category: 'missed_requirement', title: 'You cover what the job asks for', detail: 'The key skills in the job posting show up in your documents.' },
  { category: 'contradiction', title: 'Your documents agree', detail: 'Your CV and cover letter tell the same story, like years of experience.' },
  { category: 'generic_language', title: 'No stock phrases', detail: 'Lines like “team player” are swapped for specifics.' },
  { category: 'repetition', title: 'Nothing is repeated', detail: 'Each sentence earns its place.' },
  { category: 'document_defect', title: 'No placeholders or near-empty documents', detail: 'No leftover [Company] or TODO, and both documents have real content.' },
]

/** Pre-application checklist: document readiness plus the rule-based content checks. */
export function CampaignChecklist({ campaign }: { campaign: CampaignDetail }) {
  const [hidden, setHidden] = useState<Set<string>>(() => new Set())
  const developmentLoopEnabled = isR17DevelopmentLoopEnabled()
  const classify = useMutation({ mutationFn: () => classifyCampaignGaps(campaign.id) })
  const review = useMutation({
    mutationFn: () => reviewCampaign(campaign.id),
    onSuccess: () => {
      setHidden(new Set())
      classify.reset()
    },
  })
  const findings = review.data?.findings.filter((item) => !hidden.has(item.id)) ?? []
  const ready = [
    { done: Boolean(campaign.listing), title: 'The job posting is attached', detail: 'Save the job from Job Discovery or import it in Job Match so there is something to check against.' },
    { done: Boolean(campaign.selected_materials.cv_variant), title: "You've picked a CV version", detail: 'Choose one under Overview → Your documents.' },
    { done: Boolean(campaign.selected_materials.cover_letter), title: "You've picked a cover letter", detail: 'Choose one under Overview → Your documents.' },
  ]

  return (
    <div className="camp-stack">
      <WorkspacePanel kicker="Before you apply" title="Ready to send?" description="The basics every application needs.">
        <ul className="camp-checks">
          {ready.map((item) => (
            <li key={item.title} className={item.done ? 'is-pass' : 'is-todo'}>
              <CheckMark state={item.done ? 'pass' : 'todo'} />
              <div>
                <strong>{item.title}</strong>
                {item.done ? null : <p>{item.detail}</p>}
              </div>
            </li>
          ))}
        </ul>
      </WorkspacePanel>

      <WorkspacePanel
        kicker="Content checks"
        title="Check your documents"
        description="Quick rule-based checks on your chosen CV and cover letter. Nothing is changed for you."
        actions={
          <Button onClick={() => review.mutate()} loading={review.isPending} disabled={review.isPending}>
            <ClipboardCheck size={15} />
            {review.isPending ? 'Checking…' : review.data ? 'Check again' : 'Run the checks'}
          </Button>
        }
      >
        {review.isError ? <p role="alert" className="camp-alert">The checks couldn't run. Try again.</p> : null}
        {review.data ? (
          <p className="camp-muted" aria-live="polite">
            {findings.length ? `${findings.length} thing${findings.length === 1 ? '' : 's'} to look at` : 'All clear. Nice work.'}
          </p>
        ) : null}
        {developmentLoopEnabled && findings.length > 0 ? (
          <div className="camp-next-steps">
            <p>Turn what the checks found into steps in your development plan. Nothing is added until you choose.</p>
            <Button variant="outline" disabled={classify.isPending} onClick={() => classify.mutate()}>
              <ListPlus size={15} />
              {classify.isPending ? 'Working…' : 'Suggest next steps'}
            </Button>
          </div>
        ) : null}
        {classify.isError ? <p role="alert" className="camp-alert">Next steps couldn't be suggested. Nothing was added.</p> : null}
        <ul className="camp-checks">
          {CHECKS.map((check) => {
            const matches = findings.filter((item) => item.category === check.category)
            const state = !review.data ? 'idle' : matches.length ? 'warn' : 'pass'
            return (
              <li key={check.category} className={`is-${state}`}>
                <CheckMark state={state} />
                <div>
                  <strong>{check.title}</strong>
                  <p>{check.detail}</p>
                  {matches.map((item) => (
                    <article key={item.id} className="camp-finding">
                      <p>{item.message}</p>
                      <span className="camp-muted">Where: {where(item.locations)}</span>
                      {developmentLoopEnabled ? (
                        <FindingNextStep
                          campaignId={campaign.id}
                          classification={classify.data?.classifications.find((candidate) => candidate.finding_id === item.id)}
                          classificationComplete={classify.isSuccess}
                        />
                      ) : null}
                      <button type="button" className="camp-link-button" onClick={() => setHidden((current) => new Set(current).add(item.id))}>
                        Hide
                      </button>
                    </article>
                  ))}
                </div>
              </li>
            )
          })}
        </ul>
      </WorkspacePanel>
    </div>
  )
}

function CheckMark({ state }: { state: 'pass' | 'todo' | 'warn' | 'idle' }) {
  return (
    <span className={`camp-checkmark is-${state}`} aria-label={state === 'pass' ? 'Done' : state === 'idle' ? 'Not checked yet' : 'Needs a look'}>
      {state === 'pass' ? <Check size={14} aria-hidden="true" /> : state === 'idle' ? null : <CircleAlert size={14} aria-hidden="true" />}
    </span>
  )
}

function where(locations: string[]) {
  const places = [...new Set(locations.map((location) => location.split(':')[0]))]
  return places.join(', ') || 'Your documents'
}

function FindingNextStep({
  campaignId,
  classification,
  classificationComplete,
}: {
  campaignId: string
  classification: GapClassification | undefined
  classificationComplete: boolean
}) {
  if (!classification) {
    return classificationComplete ? <p className="camp-muted">No next step to suggest for this one.</p> : null
  }
  return <ClassifiedNextStep campaignId={campaignId} classification={classification} />
}

function ClassifiedNextStep({ campaignId, classification }: { campaignId: string; classification: GapClassification }) {
  const queryClient = useQueryClient()
  const response = useMutation({ mutationFn: () => getCampaignGapResponse(campaignId, classification.id) })
  const addToPlan = useMutation({
    mutationFn: () => createDevelopmentItem({ gap_classification_id: classification.id }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: DEVELOPMENT_PLAN_QUERY_KEY })
    },
  })
  const offer = response.data
  return (
    <section className="camp-step" aria-label={`Next step for ${GAP_KIND_LABELS[classification.gap_kind]}`}>
      <div className="camp-step__head">
        <span className="camp-step__label">What kind of gap</span>
        <strong>{GAP_KIND_LABELS[classification.gap_kind]}</strong>
      </div>
      <details>
        <summary>Why?</summary>
        <ul>{classification.cited_trace.map((step) => <li key={step}>{step}</li>)}</ul>
      </details>
      {!offer ? (
        <Button variant="outline" size="sm" disabled={response.isPending} onClick={() => response.mutate()}>
          {response.isPending ? 'Loading…' : 'See what to do'}
        </Button>
      ) : (
        <div className="camp-step__offer">
          <h4>{offer.headline}</h4>
          <p>{offer.detail}</p>
          <dl>
            <div><dt>Suggested step</dt><dd>{RESPONSE_KIND_LABELS[offer.response_kind]}</dd></div>
            <div><dt>Paid relationship</dt><dd>{commercialRelationshipLabel(offer.commercial_relationship)}</dd></div>
          </dl>
          {offer.sources.length > 0 ? (
            <ul aria-label="Where to go next">
              {offer.sources.map((source) => (
                <li key={`${source.label}:${source.route ?? source.url ?? ''}`}>
                  {source.route ? (
                    <Link to={source.route}>{source.label}</Link>
                  ) : source.url ? (
                    <a href={source.url} target="_blank" rel="noreferrer">{source.label}</a>
                  ) : (
                    source.label
                  )}
                </li>
              ))}
            </ul>
          ) : null}
          {offer.capture_proposal ? (
            <div className="camp-step__proposal" aria-label="Suggested profile entry">
              <strong>Suggested profile entry</strong>
              <ul>
                {contentEntries(offer.capture_proposal.content).map(({ key, value }) => (
                  <li key={key}><strong>{key}:</strong> {value}</li>
                ))}
              </ul>
              <p className="camp-muted">
                Source: {PROVENANCE_LABELS[offer.capture_proposal.provenance]} · Not saved yet. Only you can add it to your profile.
              </p>
            </div>
          ) : null}
          <Button size="sm" disabled={addToPlan.isPending || addToPlan.isSuccess} onClick={() => addToPlan.mutate()}>
            <ListPlus size={14} />
            {addToPlan.isPending ? 'Adding…' : addToPlan.isSuccess ? 'Added to your plan' : 'Add to my development plan'}
          </Button>
          {addToPlan.isSuccess ? <p role="status" className="camp-muted">Added to your development plan.</p> : null}
          {addToPlan.isError ? <p role="alert" className="camp-alert">It couldn't be added. Try again.</p> : null}
        </div>
      )}
      {response.isError ? <p role="alert" className="camp-alert">The suggestion couldn't be loaded. Try again.</p> : null}
    </section>
  )
}

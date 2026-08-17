import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { ListPlus, ShieldCheck } from 'lucide-react'
import {
  classifyCampaignGaps,
  getCampaignGapResponse,
  reviewCampaign,
} from '#/lib/api/client'
import { createDevelopmentItem } from '#/lib/api/development'
import type { GapClassification } from '#/lib/api/gapClassificationSchemas'
import { isR17DevelopmentLoopEnabled } from '#/lib/flags/featureFlags'
import {
  GAP_KIND_LABELS,
  RESPONSE_KIND_LABELS,
  commercialRelationshipLabel,
} from '#/lib/development/plan'
import { DEVELOPMENT_PLAN_QUERY_KEY } from '#/lib/query/evidenceCaches'
import { PROVENANCE_LABELS, contentEntries } from '#/lib/profile/evidence'

export function CampaignReviewer({ campaignId }: { campaignId: string }) {
  const [dismissed, setDismissed] = useState<Set<string>>(() => new Set())
  const developmentLoopEnabled = isR17DevelopmentLoopEnabled()
  const classify = useMutation({
    mutationFn: () => classifyCampaignGaps(campaignId),
  })
  const review = useMutation({
    mutationFn: () => reviewCampaign(campaignId),
    onSuccess: () => {
      setDismissed(new Set())
      classify.reset()
    },
  })
  const findings =
    review.data?.findings.filter((item) => !dismissed.has(item.id)) || []

  return (
    <section className="campaign-reviewer" aria-labelledby="reviewer-title">
      <div>
        <p className="eyebrow">Advisory only</p>
        <h2 id="reviewer-title">Application quality reviewer</h2>
        <p>
          Trace unsupported claims, missed requirements, contradictions, generic
          writing, repetition, and document defects. Findings never change your
          materials.
        </p>
      </div>
      <button
        type="button"
        disabled={review.isPending}
        onClick={() => review.mutate()}
      >
        <ShieldCheck aria-hidden="true" />
        {review.isPending
          ? 'Reviewing…'
          : review.data
            ? 'Run review again'
            : 'Run application review'}
      </button>
      {review.isError ? (
        <p role="alert" className="campaign-error">
          The advisory review could not be completed.
        </p>
      ) : null}
      {review.data ? (
        <div className="campaign-findings" aria-live="polite">
          <p>
            <strong>{findings.length}</strong> active finding
            {findings.length === 1 ? '' : 's'}
          </p>
          {developmentLoopEnabled && findings.length > 0 ? (
            <div className="campaign-development-controls">
              <p className="small-copy">
                Turn these advisory findings into explainable development next steps.
                Nothing is added or confirmed automatically.
              </p>
              <button
                type="button"
                disabled={classify.isPending}
                onClick={() => classify.mutate()}
              >
                <ListPlus aria-hidden="true" />
                {classify.isPending ? 'Classifying…' : 'Classify review findings'}
              </button>
            </div>
          ) : null}
          {classify.isError ? (
            <p role="alert" className="campaign-error">
              The findings could not be classified. No development items were created.
            </p>
          ) : null}
          {findings.map((item) => (
            <article key={item.id}>
              <div>
                <span
                  className={`campaign-finding-severity is-${item.severity}`}
                >
                  {item.severity}
                </span>
                <h3>{label(item.category)}</h3>
              </div>
              <p>{item.message}</p>
              <p className="small-copy">
                <strong>Locations:</strong> {item.locations.join(' · ')}
              </p>
              <details>
                <summary>Evidence trace</summary>
                <ul>
                  {item.trace.map((step) => (
                    <li key={step}>{step}</li>
                  ))}
                </ul>
              </details>
              {developmentLoopEnabled ? (
                <FindingDevelopmentAction
                  campaignId={campaignId}
                  classification={classify.data?.classifications.find(
                    (candidate) => candidate.finding_id === item.id,
                  )}
                  classificationComplete={classify.isSuccess}
                />
              ) : null}
              <button
                type="button"
                onClick={() =>
                  setDismissed((current) => new Set(current).add(item.id))
                }
              >
                Dismiss finding
              </button>
            </article>
          ))}
        </div>
      ) : null}
    </section>
  )
}

function FindingDevelopmentAction({
  campaignId,
  classification,
  classificationComplete,
}: {
  campaignId: string
  classification: GapClassification | undefined
  classificationComplete: boolean
}) {
  if (!classification) {
    return classificationComplete ? (
      <p className="small-copy muted-copy">
        No safe development classification was produced for this finding.
      </p>
    ) : null
  }

  return (
    <ClassifiedFindingDevelopmentAction
      campaignId={campaignId}
      classification={classification}
    />
  )
}

function ClassifiedFindingDevelopmentAction({
  campaignId,
  classification,
}: {
  campaignId: string
  classification: GapClassification
}) {
  const queryClient = useQueryClient()
  const response = useMutation({
    mutationFn: () =>
      getCampaignGapResponse(campaignId, classification.id),
  })
  const addToPlan = useMutation({
    mutationFn: () =>
      createDevelopmentItem({ gap_classification_id: classification.id }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: DEVELOPMENT_PLAN_QUERY_KEY })
    },
  })

  const offer = response.data
  return (
    <section
      className="campaign-gap-action"
      aria-label={`Development action for ${GAP_KIND_LABELS[classification.gap_kind]}`}
    >
      <div className="campaign-gap-action__heading">
        <span className="campaign-gap-action__label">Development classification</span>
        <strong>{GAP_KIND_LABELS[classification.gap_kind]}</strong>
      </div>
      <details>
        <summary>Why this classification</summary>
        <ul>
          {classification.cited_trace.map((step) => (
            <li key={step}>{step}</li>
          ))}
        </ul>
      </details>

      {!offer ? (
        <button
          type="button"
          disabled={response.isPending}
          onClick={() => response.mutate()}
        >
          {response.isPending ? 'Loading response…' : 'Inspect honest response'}
        </button>
      ) : (
        <div className="campaign-gap-response">
          <div>
            <span className="campaign-gap-action__label">Honest response</span>
            <h4>{offer.headline}</h4>
          </div>
          <p>{offer.detail}</p>
          <dl>
            <div>
              <dt>Response</dt>
              <dd>{RESPONSE_KIND_LABELS[offer.response_kind]}</dd>
            </div>
            <div>
              <dt>Commercial relationship</dt>
              <dd>{commercialRelationshipLabel(offer.commercial_relationship)}</dd>
            </div>
          </dl>
          {offer.sources.length > 0 ? (
            <ul className="campaign-gap-sources" aria-label="Recommendation sources">
              {offer.sources.map((source) => (
                <li key={`${source.label}:${source.url ?? ''}`}>
                  {source.url ? (
                    <a href={source.url} target="_blank" rel="noreferrer">
                      {source.label}
                    </a>
                  ) : (
                    source.label
                  )}
                </li>
              ))}
            </ul>
          ) : (
            <p className="small-copy muted-copy">No external sources were recommended.</p>
          )}
          {offer.capture_proposal ? (
            <div className="campaign-gap-proposal" aria-label="Evidence proposal">
              <strong>Evidence proposal</strong>
              <dl>
                <div>
                  <dt>Provenance</dt>
                  <dd>{PROVENANCE_LABELS[offer.capture_proposal.provenance]}</dd>
                </div>
                <div>
                  <dt>Status</dt>
                  <dd>Not saved or confirmed</dd>
                </div>
              </dl>
              <ul>
                {contentEntries(offer.capture_proposal.content).map(({ key, value }) => (
                  <li key={key}>
                    <strong>{key}:</strong> {value}
                  </li>
                ))}
              </ul>
              <p className="small-copy muted-copy">
                Adding the gap to your plan does not create this evidence. Completion can
                propose it later, and you remain the only person who can confirm it.
              </p>
            </div>
          ) : null}
          <button
            type="button"
            disabled={addToPlan.isPending || addToPlan.isSuccess}
            onClick={() => addToPlan.mutate()}
          >
            <ListPlus aria-hidden="true" />
            {addToPlan.isPending
              ? 'Adding…'
              : addToPlan.isSuccess
                ? 'Added to development plan'
                : 'Add to development plan'}
          </button>
          {addToPlan.isSuccess ? (
            <p role="status" className="small-copy">
              Added as planned. No evidence was created or confirmed.
            </p>
          ) : null}
          {addToPlan.isError ? (
            <p role="alert" className="campaign-error">
              The development item could not be added. No evidence was created.
            </p>
          ) : null}
        </div>
      )}
      {response.isError ? (
        <p role="alert" className="campaign-error">
          The honest response could not be loaded. No action was taken.
        </p>
      ) : null}
    </section>
  )
}

function label(value: string) {
  return value
    .replaceAll('_', ' ')
    .replace(/^./, (letter) => letter.toUpperCase())
}

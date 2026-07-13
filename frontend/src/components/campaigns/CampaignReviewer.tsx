import { useMutation } from '@tanstack/react-query'
import { useState } from 'react'
import { ShieldCheck } from 'lucide-react'
import { reviewCampaign } from '#/lib/api/client'

export function CampaignReviewer({ campaignId }: { campaignId: string }) {
  const [dismissed, setDismissed] = useState<Set<string>>(() => new Set())
  const review = useMutation({
    mutationFn: () => reviewCampaign(campaignId),
    onSuccess: () => setDismissed(new Set()),
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

function label(value: string) {
  return value
    .replaceAll('_', ' ')
    .replace(/^./, (letter) => letter.toUpperCase())
}

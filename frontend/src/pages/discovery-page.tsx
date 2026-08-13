import type { CSSProperties } from 'react'
import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useNavigate } from '@tanstack/react-router'
import {
  ArrowUpRight,
  BadgeCheck,
  Compass,
  EyeOff,
  Flag,
  FolderPlus,
  SlidersHorizontal,
  Undo2,
  X,
} from 'lucide-react'
import { PageFrame } from '#/components/app/PageFrame'
import {
  adoptDiscoveryRecommendation,
  dismissDiscoveryRecommendation,
  getDiscoveryPersonalization,
  hideDiscoverySource,
  listDiscoveryRecommendations,
  reportDiscoveryRecommendation,
  unhideDiscoverySource,
} from '#/lib/api/client'
import type {
  DiscoveryRecommendation,
  DiscoveryReportReasonCategory,
} from '#/lib/api/schemas'
import { DISCOVERY_RECOMMENDATIONS_QUERY_KEY } from '#/lib/query/evidenceCaches'

const PERSONALIZATION_KEY = ['discovery', 'personalization']

const REPORT_REASONS: { value: DiscoveryReportReasonCategory; label: string }[] = [
  { value: 'not_relevant', label: 'Not relevant to me' },
  { value: 'expired', label: 'Listing looks expired' },
  { value: 'duplicate', label: 'Duplicate posting' },
  { value: 'wrong_location', label: 'Wrong location' },
  { value: 'low_quality', label: 'Low-quality or spam' },
  { value: 'other', label: 'Other' },
]

export function DiscoveryPage() {
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const query = useQuery({
    queryKey: DISCOVERY_RECOMMENDATIONS_QUERY_KEY,
    queryFn: listDiscoveryRecommendations,
    staleTime: 60_000,
  })
  const personalization = useQuery({
    queryKey: PERSONALIZATION_KEY,
    queryFn: getDiscoveryPersonalization,
    staleTime: 60_000,
  })

  const invalidateFeed = () => {
    queryClient.invalidateQueries({ queryKey: DISCOVERY_RECOMMENDATIONS_QUERY_KEY })
    queryClient.invalidateQueries({ queryKey: PERSONALIZATION_KEY })
  }

  const dismiss = useMutation({
    mutationFn: (listingId: string) => dismissDiscoveryRecommendation(listingId),
    onSuccess: invalidateFeed,
  })
  const hide = useMutation({
    mutationFn: (sourceId: string) => hideDiscoverySource(sourceId),
    onSuccess: invalidateFeed,
  })
  const unhide = useMutation({
    mutationFn: (sourceId: string) => unhideDiscoverySource(sourceId),
    onSuccess: invalidateFeed,
  })
  const report = useMutation({
    mutationFn: (payload: {
      listingId: string
      reasonCategory: DiscoveryReportReasonCategory
      reason: string
    }) => reportDiscoveryRecommendation(payload),
    onSuccess: invalidateFeed,
  })
  const adopt = useMutation({
    mutationFn: (listingId: string) => adoptDiscoveryRecommendation(listingId),
    onSuccess: (campaign) => {
      invalidateFeed()
      navigate({ to: '/campaigns/$campaignId', params: { campaignId: campaign.id } })
    },
  })

  const hiddenSources = personalization.data?.hidden_sources ?? []

  return (
    <PageFrame>
      <section className="content-max discovery-layout">
        <header className="discovery-hero">
          <div className="discovery-hero__icon" aria-hidden="true">
            <Compass size={22} />
          </div>
          <div>
            <p className="discovery-eyebrow">Confirmed-profile ranking</p>
            <h1>Recommended opportunities</h1>
            <p>
              Live listings ranked with deterministic evidence and preference overlap.
              Your profile stays inside Career Workbench.
            </p>
            <p className="discovery-hero__correct">
              <SlidersHorizontal size={14} aria-hidden="true" />
              <Link to="/profile">Correct your preferences</Link> to reshape this feed on the
              next load.
            </p>
          </div>
        </header>

        {hiddenSources.length > 0 ? (
          <div className="discovery-hidden-bar" aria-label="Hidden sources">
            <strong>Hidden sources</strong>
            <ul>
              {hiddenSources.map((source) => (
                <li key={source.source_id}>
                  <span>{source.display_name}</span>
                  <button
                    type="button"
                    onClick={() => unhide.mutate(source.source_id)}
                    disabled={unhide.isPending}
                  >
                    <Undo2 size={13} aria-hidden="true" /> Unhide
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        {query.isLoading ? (
          <div className="discovery-skeleton" role="status" aria-label="Loading recommendations">
            <span className="discovery-skeleton__title" />
            <span className="discovery-skeleton__line" />
            <span className="discovery-skeleton__line discovery-skeleton__line--short" />
          </div>
        ) : null}
        {query.isError ? (
          <div className="discovery-state discovery-state--error" role="alert">
            <strong>Recommendations could not be loaded.</strong>
            <button type="button" onClick={() => query.refetch()}>Try again</button>
          </div>
        ) : null}
        {query.data?.confirmed_item_count === 0 ? (
          <div className="discovery-state">
            <BadgeCheck size={24} aria-hidden="true" />
            <strong>Confirm profile evidence to rank opportunities.</strong>
            <p>Unconfirmed and rejected items never influence this feed.</p>
            <Link to="/profile">Review evidence profile</Link>
          </div>
        ) : null}
        {query.data && query.data.confirmed_item_count > 0 && query.data.items.length === 0 ? (
          <div className="discovery-state">
            <Compass size={24} aria-hidden="true" />
            <strong>No live recommendations yet.</strong>
            <p>Expired listings are removed automatically. Check back after the next governed source refresh.</p>
          </div>
        ) : null}

        {query.data && query.data.confirmed_item_count > 0 && query.data.items.length > 0 ? (
          <>
            <div className="discovery-summary" aria-label="Recommendation inputs">
              <span>{query.data.items.length} live roles</span>
              <span>{query.data.confirmed_item_count} confirmed profile items</span>
              <span>{query.data.preference_item_count} confirmed preferences</span>
            </div>
            <ol className="discovery-list" aria-label="Ranked job recommendations">
              {query.data.items.map((recommendation, index) => (
                <li
                  key={recommendation.listing_id}
                  className="discovery-card"
                  style={{
                    '--recommendation-index': index,
                  } as CSSProperties}
                >
                  <RecommendationCard
                    recommendation={recommendation}
                    onAdopt={() => adopt.mutate(recommendation.listing_id)}
                    onDismiss={() => dismiss.mutate(recommendation.listing_id)}
                    onHideSource={(sourceId) => hide.mutate(sourceId)}
                    onReport={(reasonCategory, reason) =>
                      report.mutate({
                        listingId: recommendation.listing_id,
                        reasonCategory,
                        reason,
                      })
                    }
                    isAdopting={
                      adopt.isPending && adopt.variables === recommendation.listing_id
                    }
                    isDismissing={dismiss.isPending}
                    isHiding={hide.isPending}
                    isReporting={report.isPending}
                  />
                </li>
              ))}
            </ol>
          </>
        ) : null}
      </section>
    </PageFrame>
  )
}

type RecommendationCardProps = {
  recommendation: DiscoveryRecommendation
  onAdopt: () => void
  onDismiss: () => void
  onHideSource: (sourceId: string) => void
  onReport: (reasonCategory: DiscoveryReportReasonCategory, reason: string) => void
  isAdopting: boolean
  isDismissing: boolean
  isHiding: boolean
  isReporting: boolean
}

function RecommendationCard({
  recommendation,
  onAdopt,
  onDismiss,
  onHideSource,
  onReport,
  isAdopting,
  isDismissing,
  isHiding,
  isReporting,
}: RecommendationCardProps) {
  const [reportOpen, setReportOpen] = useState(false)
  const [reasonCategory, setReasonCategory] =
    useState<DiscoveryReportReasonCategory>('not_relevant')
  const [reason, setReason] = useState('')

  return (
    <article>
      <header className="discovery-card__header">
        <div>
          <p className="discovery-card__company">{recommendation.company}</p>
          <h2>{recommendation.title}</h2>
        </div>
        <div className="discovery-score">
          <strong>{recommendation.score}</strong>
          <span>match</span>
          <meter
            min="0"
            max="100"
            value={recommendation.score}
            aria-label={`${recommendation.score} out of 100 match`}
          />
        </div>
      </header>

      <details className="discovery-description">
        <summary>Read listing details</summary>
        <p>{recommendation.description}</p>
      </details>

      <section className="discovery-rationale" aria-label="Why this was ranked here">
        <h3><SlidersHorizontal size={16} aria-hidden="true" /> Why this rank</h3>
        <ul>
          {recommendation.rationale.map((signal) => (
            <li key={signal.kind}>
              <div>
                <strong>{signal.label}</strong>
                <span>{signal.score}/100 signal</span>
              </div>
              <p>
                {signal.matched_keywords.length > 0
                  ? signal.matched_keywords.join(' · ')
                  : 'No matching confirmed terms.'}
              </p>
            </li>
          ))}
        </ul>
      </section>

      <footer className="discovery-sources">
        <h3>Sources and freshness</h3>
        <ul>
          {recommendation.attributions.map((attribution) => (
            <li key={`${attribution.source_id}-${attribution.source_url}`}>
              <a href={attribution.source_url} target="_blank" rel="noreferrer">
                {attribution.source_name}
                <ArrowUpRight size={14} aria-hidden="true" />
              </a>
              <span>
                Retrieved {new Date(attribution.retrieved_at).toLocaleDateString()}
              </span>
              <button
                type="button"
                className="discovery-source-hide"
                onClick={() => onHideSource(attribution.source_id)}
                disabled={isHiding}
                aria-label={`Hide ${attribution.source_name}`}
              >
                <EyeOff size={13} aria-hidden="true" /> Hide source
              </button>
            </li>
          ))}
        </ul>
      </footer>

      <div className="discovery-controls" aria-label="Recommendation controls">
        <button
          type="button"
          className="discovery-control discovery-control--adopt"
          onClick={onAdopt}
          disabled={isAdopting}
        >
          <FolderPlus size={14} aria-hidden="true" />
          {isAdopting ? 'Adopting…' : 'Adopt into campaign'}
        </button>
        <button
          type="button"
          className="discovery-control discovery-control--dismiss"
          onClick={onDismiss}
          disabled={isDismissing}
        >
          <X size={14} aria-hidden="true" /> Dismiss
        </button>
        <button
          type="button"
          className="discovery-control discovery-control--report"
          onClick={() => setReportOpen((open) => !open)}
          aria-expanded={reportOpen}
        >
          <Flag size={14} aria-hidden="true" /> Report a problem
        </button>
      </div>

      {reportOpen ? (
        <form
          className="discovery-report-form"
          aria-label="Report this recommendation"
          onSubmit={(event) => {
            event.preventDefault()
            if (reason.trim().length === 0) return
            onReport(reasonCategory, reason.trim())
            setReportOpen(false)
            setReason('')
          }}
        >
          <label>
            Reason
            <select
              value={reasonCategory}
              onChange={(event) =>
                setReasonCategory(event.target.value as DiscoveryReportReasonCategory)
              }
            >
              {REPORT_REASONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <label>
            What went wrong?
            <textarea
              value={reason}
              maxLength={2000}
              required
              onChange={(event) => setReason(event.target.value)}
              placeholder="Tell us why this recommendation is wrong."
            />
          </label>
          <div className="discovery-report-form__actions">
            <button type="submit" disabled={isReporting || reason.trim().length === 0}>
              Submit report
            </button>
            <button type="button" onClick={() => setReportOpen(false)}>
              Cancel
            </button>
          </div>
        </form>
      ) : null}
    </article>
  )
}

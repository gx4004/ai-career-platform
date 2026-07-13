import type { CSSProperties } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { ArrowUpRight, BadgeCheck, Compass, SlidersHorizontal } from 'lucide-react'
import { PageFrame } from '#/components/app/PageFrame'
import { listDiscoveryRecommendations } from '#/lib/api/client'

export function DiscoveryPage() {
  const query = useQuery({
    queryKey: ['discovery', 'recommendations'],
    queryFn: listDiscoveryRecommendations,
    staleTime: 60_000,
  })

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
          </div>
        </header>

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
                          <li key={`${attribution.source_name}-${attribution.source_url}`}>
                            <a href={attribution.source_url} target="_blank" rel="noreferrer">
                              {attribution.source_name}
                              <ArrowUpRight size={14} aria-hidden="true" />
                            </a>
                            <span>
                              Retrieved {new Date(attribution.retrieved_at).toLocaleDateString()}
                            </span>
                          </li>
                        ))}
                      </ul>
                    </footer>
                  </article>
                </li>
              ))}
            </ol>
          </>
        ) : null}
      </section>
    </PageFrame>
  )
}

# 0008. Discovery sources are registry-gated with bounded, attributable ingestion

**Status:** accepted
**Date:** 2026-07-10

## Context

R14 requires deduplicated, explainable job recommendations from sources that
explicitly permit the implemented behavior. Today the only fetcher is the
user-directed single-URL importer: a three-tier scrape (BeautifulSoup, bounded
Playwright fallback, graceful paste stub) that is SSRF-hardened and self-identifies
in tier one, but persists nothing, consults no robots.txt, and has no notion of a
source's terms, rate, retention, or owner. There is no scheduler, no source
allowlist, and no listings store. The accepted decisions already prohibit
unauthorized scraping, CAPTCHA or access-control circumvention, credential or
session extraction (D-026), and cap operational source evidence at allowlisted
source families (D-059).

## Decision

Every discovery source is an entry in a source registry, and no ingestion happens
outside it. A registry entry documents owner, terms status with review date,
allowed behavior, rate limit, attribution rule, retention rule, and kill switch,
following the accepted source preference order: licensed APIs and feeds, then
employer/ATS integrations that explicitly permit the use, then allowlisted public
career pages after terms and robots review, then user-provided URLs or paste.
Ingestion is server-side and pull-bounded — bounded fetches within each source's
declared rate, honoring robots.txt and technical controls for public sources, with
an honest identifying user agent in every tier; there is no general crawler and no
unbounded background collection. Discovered listings persist in a product-owned
listings store carrying source attribution and retrieval date, deduplicated across
sources, expired per source retention rules — a store distinct from campaign
canonical listings, which remain owner content (D-078).

## Alternatives Considered

- **Reuse the user-directed importer as the discovery fetcher** — rejected: it is
  governed as a user action on one URL; discovery-scale fetching needs per-source
  terms, rate, retention, and kill-switch governance the importer lacks by design.
- **A generic crawler over public job boards** — rejected: directly violates D-026
  and the product-direction prohibition on unauthorized scraping and circumvention.
- **Client-side fetching in the user's browser** — rejected: bypasses SSRF
  hardening, rate governance, and attribution, and pushes terms risk onto users.
- **No listings store (rank live per request)** — rejected: dedup, expiry handling,
  and recommendation explainability all require persisted listings with
  attribution and retrieval dates.

## Consequences

- Adding a source is a governance act (registry entry with owner and terms review),
  not a code path — which is the point.
- A listings store with per-source retention becomes a new non-user data surface
  needing monitoring, expiry jobs, and threat-model coverage.
- Per-source kill switches localize failures and terms disputes without disabling
  discovery entirely (consistent with D-059's adapter posture).
- Rollback posture: nothing ships until R13 lands; afterward disabling a source or
  the whole registry returns the product to user-directed import/paste only,
  losing recommendations but no user data.

import { getDiscoveryListing, searchDiscoveryListings } from '#/lib/api/client'
import { DISCOVERY_RECOMMENDATIONS_QUERY_KEY } from '#/lib/query/evidenceCaches'

/** Jobs per page on Discover. */
export const DISCOVERY_PAGE_SIZE = 10

// Under the recommendations prefix so Evidence Profile edits (which change the
// match scores) invalidate the search too.
export const DISCOVERY_LISTINGS_KEY = [...DISCOVERY_RECOMMENDATIONS_QUERY_KEY, 'listings']

export type DiscoverySearchParams = Omit<Parameters<typeof searchDiscoveryListings>[0], 'page' | 'limit'>

/** The filters Discover opens with: best match first, nothing narrowed. */
export const DEFAULT_DISCOVERY_PARAMS: DiscoverySearchParams = { sort: 'best_match' }

/** One page of listings (key and fetch), shared by the page and the route's prefetch. */
export const discoveryListingsQuery = (params: DiscoverySearchParams, page: number) => ({
  queryKey: [...DISCOVERY_LISTINGS_KEY, params, page],
  queryFn: () => searchDiscoveryListings({ ...params, page, limit: DISCOVERY_PAGE_SIZE }),
  staleTime: 60_000,
})

// List responses carry a short preview; the full description is fetched on demand.
export const discoveryDetailQuery = (listingId: string) => ({
  queryKey: [...DISCOVERY_LISTINGS_KEY, 'detail', listingId],
  queryFn: () => getDiscoveryListing(listingId),
  staleTime: 5 * 60_000,
})

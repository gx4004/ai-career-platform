import { createFileRoute, lazyRouteComponent } from '@tanstack/react-router'
import type { SearchMiddleware } from '@tanstack/react-router'

type HistorySearch = {
  tool?: string
  favorite?: boolean
  q?: string
  page?: number
  page_size?: number
}

const MAX_PAGE_SIZE = 50 // backend/app/routers/history.py

// TanStack's default search parser JSON-parses every value, so `?page=2` and
// `?q=2026` arrive as NUMBERS. Accept both shapes and coerce.
function toPositiveInt(value: unknown, max = Number.MAX_SAFE_INTEGER): number | undefined {
  const n = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : Number.NaN
  if (!Number.isFinite(n)) return undefined
  return Math.min(max, Math.max(1, Math.trunc(n)))
}

function toQuery(value: unknown): string | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return String(value)
  if (typeof value === 'string' && value.trim()) return value
  return undefined
}

function validateHistorySearch(search: Record<string, unknown>): HistorySearch {
  return {
    tool: typeof search.tool === 'string' && search.tool ? search.tool : undefined,
    // Only ever "true": an absent filter must not become `favorite=false`,
    // which the API reads as "show only runs that are not starred".
    favorite:
      search.favorite === true ||
      search.favorite === 'true' ||
      search.favorite === '1' ||
      search.favorite === 1
        ? true
        : undefined,
    q: toQuery(search.q),
    page: toPositiveInt(search.page),
    page_size: toPositiveInt(search.page_size, MAX_PAGE_SIZE),
  }
}

// The default serializer writes a digit-only string as a JSON-quoted value
// (`?q=%222026%22`) so it survives the JSON parse. Write it as a plain number
// instead; validateHistorySearch turns it back into the string the user typed.
const unquoteNumericQuery: SearchMiddleware<HistorySearch> = ({ search, next }) => {
  const result = next(search)
  const q = result.q
  if (typeof q === 'string' && String(Number(q)) === q) {
    return { ...result, q: Number(q) as unknown as string }
  }
  return result
}

export const Route = createFileRoute('/history')({
  head: () => ({
    meta: [{ title: 'History | Career Workbench' }],
  }),
  validateSearch: validateHistorySearch,
  search: { middlewares: [unquoteNumericQuery] },
  component: lazyRouteComponent(() => import('#/pages/history-page'), 'HistoryRoutePage'),
})

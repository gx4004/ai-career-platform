import { useQuery } from '@tanstack/react-query'
import { useAccountQueriesEnabled } from '#/hooks/useAccountQueriesEnabled'
import { useHistory } from '#/hooks/useHistory'
import { useSession } from '#/hooks/useSession'
import { listApplications, listCvDocuments } from '#/lib/api/client'
import { APPLICATION_BOARD_QUERY_KEY } from '#/lib/query/applicationCaches'

/**
 * Where the signed-in user stands with their CV: the newest CV Studio document, or a past Resume Analyzer
 * run, or neither (then the dashboard leads with the resume upload). Shared by the page and the CV row,
 * both read the same two cached queries.
 */
export function useDashboardCv() {
  const { status } = useSession()
  const authenticated = status === 'authenticated'
  // Loads alongside /auth/me in a browser that was signed in (see useAccountQueriesEnabled).
  const enabled = useAccountQueriesEnabled()
  const cvs = useQuery({ queryKey: ['cv-studio', 'list'], queryFn: listCvDocuments, enabled })
  const resumeRuns = useHistory({ tool: 'resume', page: 1, page_size: 1 }, enabled)
  // The pipeline panel's query (same key, so no extra request): the third first step is "add a job".
  const board = useQuery({ queryKey: APPLICATION_BOARD_QUERY_KEY, queryFn: listApplications, enabled })

  const latest =
    cvs.data?.items.slice().sort((a, b) => b.updated_at.localeCompare(a.updated_at))[0] ?? null
  const hasResumeRun = (resumeRuns.data?.total ?? 0) > 0
  const pending = authenticated && (cvs.isPending || resumeRuns.isPending)
  // A failed lookup says nothing about the user, so it never counts as "no CV".
  const isNewcomer = authenticated && cvs.isSuccess && resumeRuns.isSuccess && !latest && !hasResumeRun
  // A resume is in: a CV, or a Resume Analyzer run.
  const hasResume = Boolean(latest) || hasResumeRun
  const hasApplications = board.isSuccess ? board.data.items.length > 0 : null
  // "Your first 3 steps" stays until all three are done: the last one is adding a job (an application exists).
  // A failed lookup never shows them to someone who may have done it all.
  const showFirstSteps =
    isNewcomer || (authenticated && cvs.isSuccess && resumeRuns.isSuccess && hasApplications === false)
  // Whether the first steps show is not known yet: the page waits for it before starting the tour.
  const stepsPending = pending || (authenticated && !isNewcomer && board.isPending)

  const isError = cvs.isError || resumeRuns.isError
  const fetching = cvs.isFetching || resumeRuns.isFetching
  const retry = () => {
    if (cvs.isError) void cvs.refetch()
    if (resumeRuns.isError) void resumeRuns.refetch()
  }

  return { latest, hasResumeRun, hasResume, hasApplications, pending, isNewcomer, showFirstSteps, stepsPending, isError, fetching, retry }
}

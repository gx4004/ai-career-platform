import { useQuery } from '@tanstack/react-query'
import { useHistory } from '#/hooks/useHistory'
import { useSession } from '#/hooks/useSession'
import { listCvDocuments } from '#/lib/api/client'

/**
 * Where the signed-in user stands with their CV: the newest CV Studio document, or a past Resume Analyzer
 * run, or neither (then the dashboard leads with the resume upload). Shared by the page and the CV row,
 * both read the same two cached queries.
 */
export function useDashboardCv() {
  const { status } = useSession()
  const authenticated = status === 'authenticated'
  const cvs = useQuery({ queryKey: ['cv-studio', 'list'], queryFn: listCvDocuments, enabled: authenticated })
  const resumeRuns = useHistory({ tool: 'resume', page: 1, page_size: 1 }, authenticated)

  const latest =
    cvs.data?.items.slice().sort((a, b) => b.updated_at.localeCompare(a.updated_at))[0] ?? null
  const hasResumeRun = (resumeRuns.data?.total ?? 0) > 0
  const pending = authenticated && (cvs.isPending || resumeRuns.isPending)
  // A failed lookup says nothing about the user, so it never counts as "no CV".
  const isNewcomer = authenticated && cvs.isSuccess && resumeRuns.isSuccess && !latest && !hasResumeRun

  const isError = cvs.isError || resumeRuns.isError
  const fetching = cvs.isFetching || resumeRuns.isFetching
  const retry = () => {
    if (cvs.isError) void cvs.refetch()
    if (resumeRuns.isError) void resumeRuns.refetch()
  }

  return { latest, hasResumeRun, pending, isNewcomer, isError, fetching, retry }
}

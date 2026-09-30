import { Link } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { formatDate } from '#/components/applications/stages'
import { Button } from '#/components/ui/button'
import { useHistory } from '#/hooks/useHistory'
import { useSession } from '#/hooks/useSession'
import { listCvDocuments } from '#/lib/api/client'
import { DashboardResumeUpload } from './DashboardResumeUpload'

/**
 * Upload while the user has neither a CV document nor a resume run; once they
 * have a CV, one quiet line that opens CV Studio. Guests always get the upload.
 */
export function DashboardCv() {
  const { status } = useSession()
  const authenticated = status === 'authenticated'
  const cvs = useQuery({ queryKey: ['cv-studio', 'list'], queryFn: listCvDocuments, enabled: authenticated })
  const resumeRuns = useHistory({ tool: 'resume', page: 1, page_size: 1 }, authenticated)

  if (!authenticated) return <DashboardResumeUpload />
  if (cvs.isPending || resumeRuns.isPending) return null

  const latest = cvs.data?.items
    .slice()
    .sort((a, b) => b.updated_at.localeCompare(a.updated_at))[0]
  if (latest) {
    return (
      <section className="dash-section" aria-label="Your CV">
        <div className="dash-cv">
          <span className="dash-cv__label">Your CV</span>
          <span className="dash-cv__name">{latest.name}</span>
          <span className="dash-cv__meta">Edited {formatDate(latest.updated_at)}</span>
          <Button asChild variant="outline" size="sm">
            <Link to="/cv-studio">Open CV Studio</Link>
          </Button>
        </div>
      </section>
    )
  }
  if ((resumeRuns.data?.total ?? 0) > 0) return null
  return (
    <section className="dash-section" aria-labelledby="dash-start">
      <div className="dash-section__head">
        <h2 className="dash-section__title" id="dash-start">Start</h2>
      </div>
      <DashboardResumeUpload />
    </section>
  )
}

import { useNavigate } from '@tanstack/react-router'
import { FadeUp } from '#/components/ui/motion'
import { DropzoneHero } from '#/components/tooling/DropzoneHero'
import { tools } from '#/lib/tools/registry'
import { writeWorkflowContext } from '#/lib/tools/drafts'

export function DashboardHero() {
  const navigate = useNavigate()

  return (
    <section className="dash-hero">
      <FadeUp className="dash-hero-panel dash-hero-split">
        <div className="dash-hero-intro">
          <h1 className="dash-hero-title">
            Review your resume
          </h1>
          <p className="dash-hero-body">
            Upload once to get a score, compare yourself to roles, and improve your application.
          </p>
        </div>
        <div className="dash-hero-action">
          <DropzoneHero
            accent={tools.resume.accent}
            onParsed={(text) => {
              writeWorkflowContext({
                resumeText: text,
                resumePendingReview: true,
                updatedAt: Date.now(),
              })
              navigate({ to: '/resume' })
            }}
          />
        </div>
      </FadeUp>
    </section>
  )
}

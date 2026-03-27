import { useNavigate } from '@tanstack/react-router'
import { FadeUp } from '#/components/ui/motion'
import { DropzoneHero } from '#/components/tooling/DropzoneHero'
import { tools } from '#/lib/tools/registry'
import { writeWorkflowContext } from '#/lib/tools/drafts'

export function DashboardHero() {
  const navigate = useNavigate()

  return (
    <section className="dash-hero-dark">
      <FadeUp className="dash-hero-dark-inner">
        <div className="dash-hero-dark-headline">
          <p className="dash-hero-dark-eyebrow">Your workspace</p>
          <h1 className="dash-hero-dark-title">Start with your resume.</h1>
          <p className="dash-hero-dark-subtitle">
            Drop it once. Get a score, targeted fixes, cover letters, interview prep, and your next move.
          </p>
        </div>

        <div className="dash-hero-dark-drop-wrap">
          <div className="dash-hero-dark-drop-glow" aria-hidden />
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

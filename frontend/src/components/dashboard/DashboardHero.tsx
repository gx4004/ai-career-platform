import { useNavigate } from '@tanstack/react-router'
import { Sparkles } from 'lucide-react'
import { Badge } from '#/components/ui/badge'
import { FadeUp } from '#/components/ui/motion'
import { DropzoneHero } from '#/components/tooling/DropzoneHero'
import { tools } from '#/lib/tools/registry'
import { writeWorkflowContext } from '#/lib/tools/drafts'

export function DashboardHero() {
  const navigate = useNavigate()

  return (
    <section className="dash-hero">
      <FadeUp className="dash-hero-panel dash-hero-copy">
        <div className="dash-hero-copy-inner">
          <Badge variant="outline" className="dash-hero-badge w-fit">
            <Sparkles size={12} />
            AI-driven
          </Badge>
          <div className="dash-hero-headline-group">
            <h1 className="dash-hero-title text-gradient-hero">
              Let's start with your resume.
            </h1>
            <p className="dash-hero-body">
              Upload once. Every tool pulls from the same context — your resume,
              your target role, your real data.
            </p>
          </div>
        </div>
      </FadeUp>
      <FadeUp delay={0.15} className="dash-hero-panel dash-hero-side dash-hero-dropzone">
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
      </FadeUp>
    </section>
  )
}

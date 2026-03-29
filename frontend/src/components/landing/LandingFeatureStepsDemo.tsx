import { ScrollReveal } from '#/components/ui/motion'
import { FeatureSteps, type Feature } from '#/components/ui/feature-section'
import {
  landingWorkflowCopy,
  landingWorkflowFeatures,
} from '#/components/landing/landingContent'

const features: Feature[] = [...landingWorkflowFeatures]

export function LandingFeatureStepsDemo({ autoPlay = false }: { autoPlay?: boolean }) {
  return (
    <section className="landing-section landing-section-feature-steps" id="landing-journey">
      <div className="content-max landing-experiment-surface landing-experiment-surface--workflow">
        <ScrollReveal>
          <div className="landing-section-heading landing-section-heading--feature-steps landing-feature-intro">
            <div className="landing-feature-intro-copy">
              <p className="eyebrow">{landingWorkflowCopy.eyebrow}</p>
              <h2 className="display-lg">{landingWorkflowCopy.title}</h2>
            </div>
            {landingWorkflowCopy.body ? <p className="muted-copy landing-feature-intro-support">{landingWorkflowCopy.body}</p> : null}
          </div>
        </ScrollReveal>
        <ScrollReveal>
          <div className="landing-feature-shell section-card">
            <FeatureSteps
              features={features}
              title=""
              autoPlay={autoPlay}
              autoPlayInterval={4800}
              imageHeight=""
              imageLink="/dashboard"
              className="bg-transparent"
            />
          </div>
        </ScrollReveal>
      </div>
    </section>
  )
}

import { ScrollStagger, ScrollStaggerItem } from '#/components/ui/motion'
import { StaggerTestimonials } from '#/components/ui/stagger-testimonials'
import { landingSocialProofStat } from '#/components/landing/landingContent'

export function LandingSocialProof() {
  return (
    <section className="landing-section landing-section-social-proof" id="landing-social-proof">
      <div className="content-max">
        <ScrollStagger className="landing-section-heading" stagger={0.1}>
          <ScrollStaggerItem>
            <p className="eyebrow">Real results from real job seekers</p>
          </ScrollStaggerItem>
          <ScrollStaggerItem>
            <h2 className="display-lg">
              {landingSocialProofStat.value} resumes analyzed. Careers unblocked.
            </h2>
          </ScrollStaggerItem>
          <ScrollStaggerItem>
            <p className="muted-copy">
              From first upload to first interview — here's what job seekers are saying.
            </p>
          </ScrollStaggerItem>
        </ScrollStagger>
      </div>
      <StaggerTestimonials />
    </section>
  )
}

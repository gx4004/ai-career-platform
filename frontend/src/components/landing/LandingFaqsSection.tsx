import { ScrollReveal } from '#/components/ui/motion'
import { FaqAnimated } from '#/components/ui/faq-animated'
import {
  landingFaqCopy,
  landingFaqQuestions,
} from '#/components/landing/landingContent'

export function LandingFaqsSection() {
  return (
    <section className="landing-section landing-section-faqs" id="landing-faq">
      <div className="content-max landing-experiment-surface landing-experiment-surface--faq">
        <ScrollReveal>
          <div className="landing-section-heading landing-section-heading--faq">
            <p className="eyebrow">{landingFaqCopy.eyebrow}</p>
            <h2 className="display-lg">{landingFaqCopy.title}</h2>
            <p className="muted-copy">{landingFaqCopy.body}</p>
          </div>
        </ScrollReveal>
        <ScrollReveal>
          <FaqAnimated
            questions={[...landingFaqQuestions]}
            className="mx-auto max-w-3xl"
          />
        </ScrollReveal>
      </div>
    </section>
  )
}

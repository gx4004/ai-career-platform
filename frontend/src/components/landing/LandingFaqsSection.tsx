import { ScrollStagger, ScrollStaggerItem } from '#/components/ui/motion'
import { FaqAnimated } from '#/components/ui/faq-animated'
import {
  landingFaqCopy,
  landingFaqQuestions,
} from '#/components/landing/landingContent'

export function LandingFaqsSection() {
  return (
    <section className="landing-section landing-section-faqs" id="landing-faq">
      <div className="content-max landing-experiment-surface landing-experiment-surface--faq">
        <ScrollStagger stagger={0.1}>
          <ScrollStaggerItem>
            <div className="landing-section-heading landing-section-heading--faq">
              <p className="eyebrow">{landingFaqCopy.eyebrow}</p>
              <h2 className="display-lg">{landingFaqCopy.title}</h2>
              <p className="muted-copy">{landingFaqCopy.body}</p>
            </div>
          </ScrollStaggerItem>
          <ScrollStaggerItem>
            <FaqAnimated
              questions={[...landingFaqQuestions]}
              className="mx-auto max-w-3xl"
            />
          </ScrollStaggerItem>
        </ScrollStagger>
      </div>
    </section>
  )
}

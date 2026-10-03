import { useState } from 'react'
import { Disclosure } from '#/components/kit'
import { landingFaqQuestions } from '#/components/landing/landingContent'

export function LandingFaqsSection() {
  const [openId, setOpenId] = useState<string | null>(landingFaqQuestions[0]?.id ?? null)

  return (
    <section className="lp-section" id="landing-faq">
      <div className="lp-container lp-faq">
        <h2 className="lp-section-h2">Frequently Asked Questions</h2>
        <div className="lp-faq-list">
          {landingFaqQuestions.map((q) => {
            const open = openId === q.id
            return (
              <Disclosure
                key={q.id}
                className="lp-faq-item"
                data-open={open}
                title={q.title}
                open={open}
                onOpenChange={(next) => setOpenId(next ? q.id : null)}
              >
                <p className="lp-faq-content">{q.content}</p>
              </Disclosure>
            )
          })}
        </div>
      </div>
    </section>
  )
}

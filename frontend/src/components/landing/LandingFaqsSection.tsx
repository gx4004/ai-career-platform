import { useState } from 'react'
import { Disclosure, Panel } from '#/components/kit'
import { landingFaqQuestions } from '#/components/landing/landingContent'

export function LandingFaqsSection() {
  const [openId, setOpenId] = useState<string | null>(landingFaqQuestions[0]?.id ?? null)

  return (
    <section className="lp-section" id="landing-faq" aria-labelledby="landing-faq-heading">
      <div className="lp-wrap">
        <div className="lp-section__head">
          <h2 className="lp-display lp-display--l" id="landing-faq-heading">
            Frequently asked questions
          </h2>
        </div>
        <Panel flush className="lp-faq-list">
          {landingFaqQuestions.map((q) => {
            const open = openId === q.id
            return (
              <Disclosure
                key={q.id}
                title={q.title}
                headingLevel={3}
                open={open}
                onOpenChange={(next) => setOpenId(next ? q.id : null)}
              >
                <p className="lp-faq-content">{q.content}</p>
              </Disclosure>
            )
          })}
        </Panel>
      </div>
    </section>
  )
}

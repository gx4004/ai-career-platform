import { useEffect, useMemo, useRef, useState } from 'react'
import { useReducedMotion } from 'framer-motion'
import {
  AnimatePresence,
  ScrollReveal,
  motion,
} from '#/components/ui/motion'
import {
  landingContextShowcaseCopy,
  landingContextStoryboardSteps,
} from '#/components/landing/landingContent'
import { useIsMobile } from '#/hooks/use-mobile'

export function LandingExperimentScrollShowcase() {
  const isMobile = useIsMobile()
  const prefersReducedMotion = useReducedMotion() ?? false
  const useStaticLayout = isMobile || prefersReducedMotion
  const [activeStepId, setActiveStepId] = useState<string>(landingContextStoryboardSteps[0].id)
  const itemRefs = useRef<Array<HTMLElement | null>>([])
  const activeStep = useMemo(
    () =>
      landingContextStoryboardSteps.find((step) => step.id === activeStepId) ??
      landingContextStoryboardSteps[0],
    [activeStepId],
  )

  useEffect(() => {
    if (useStaticLayout) {
      return
    }

    const observer = new IntersectionObserver(
      (entries) => {
        const visibleEntries = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio)

        if (visibleEntries[0]?.target instanceof HTMLElement) {
          setActiveStepId(visibleEntries[0].target.dataset.storyStep ?? landingContextStoryboardSteps[0].id)
        }
      },
      { threshold: [0.35, 0.55, 0.75] },
    )

    itemRefs.current.forEach((item) => {
      if (item) {
        observer.observe(item)
      }
    })

    return () => observer.disconnect()
  }, [useStaticLayout])

  if (useStaticLayout) {
    return (
      <section
        className="landing-section landing-section-scroll-showcase scroll-mt-28"
        id="landing-workspace"
      >
        <div className="content-max">
          <div className="landing-section-heading">
            <p className="eyebrow">{landingContextShowcaseCopy.eyebrow}</p>
            <h2 className="display-lg text-balance">{landingContextShowcaseCopy.title}</h2>
            <p className="muted-copy max-w-2xl text-balance">{landingContextShowcaseCopy.body}</p>
          </div>

          <div className="landing-context-static section-card">
            <div className="landing-context-static-header">
              <span className="landing-context-static-pill is-accent">Resume baseline loaded</span>
              <span className="landing-context-static-pill">Role context synced</span>
            </div>
            <div className="landing-context-static-frame">
              <img
                src="/ai-generated/carousel/final-job-match.png"
                alt="Connected workspace preview"
                className="landing-context-static-image"
                draggable={false}
              />
            </div>
            <div className="landing-context-static-footer">
              {['Resume signal', 'Role gaps', 'Next moves'].map((item) => (
                <span key={item} className="landing-context-static-pill">
                  {item}
                </span>
              ))}
            </div>
          </div>
        </div>
      </section>
    )
  }

  return (
    <section
      className="landing-section landing-section-scroll-showcase scroll-mt-28"
      id="landing-workspace"
    >
      <div className="content-max">
        <ScrollReveal>
          <div className="landing-section-heading">
            <p className="eyebrow">{landingContextShowcaseCopy.eyebrow}</p>
            <h2 className="display-lg text-balance">{landingContextShowcaseCopy.title}</h2>
            <p className="muted-copy max-w-2xl text-balance">{landingContextShowcaseCopy.body}</p>
          </div>
        </ScrollReveal>

        <div className="landing-storyboard">
          <div className="landing-storyboard-copy">
            {landingContextStoryboardSteps.map((step, index) => (
              <article
                key={step.id}
                ref={(element) => {
                  itemRefs.current[index] = element
                }}
                data-story-step={step.id}
                data-active={activeStep.id === step.id ? 'true' : 'false'}
                className="landing-story-step"
              >
                <p className="landing-story-step-index">{step.step}</p>
                <p className="landing-story-step-eyebrow">{step.eyebrow}</p>
                <h3 className="landing-story-step-title">{step.title}</h3>
                <p className="landing-story-step-body">{step.body}</p>
                <div className="landing-story-step-pills">
                  {step.chips.map((chip) => (
                    <span key={chip} className="landing-story-step-pill">
                      {chip}
                    </span>
                  ))}
                </div>
              </article>
            ))}
          </div>

          <div className="landing-storyboard-stage-wrap">
            <div className="landing-storyboard-stage-sticky">
              <AnimatePresence mode="wait">
                <motion.div
                  key={activeStep.id}
                  className="landing-storyboard-stage"
                  data-testid="landing-storyboard-stage"
                  initial={{ opacity: 0, y: 18, scale: 0.98 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: -18, scale: 1.01 }}
                  transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
                >
                  <div className="landing-storyboard-stage-bar">
                    <div className="hero-mockup-dots" aria-hidden="true">
                      <span />
                      <span />
                      <span />
                    </div>
                    <div className="landing-storyboard-stage-bar-copy">
                      <span className="landing-storyboard-stage-kicker">
                        {activeStep.eyebrow}
                      </span>
                      <span className="landing-storyboard-stage-status">Shared context active</span>
                    </div>
                  </div>

                  <div className="landing-storyboard-stage-frame">
                    <img
                      src={activeStep.image}
                      alt="Connected workspace preview"
                      className="landing-storyboard-stage-image"
                      draggable={false}
                    />
                    <div className="landing-storyboard-stage-floating-card">
                      <p className="landing-storyboard-stage-floating-eyebrow">
                        {activeStep.eyebrow}
                      </p>
                      <p className="landing-storyboard-stage-floating-title">
                        {activeStep.title}
                      </p>
                    </div>
                    <div className="landing-storyboard-stage-pills">
                      {activeStep.chips.map((chip) => (
                        <span key={chip} className="landing-storyboard-stage-pill">
                          {chip}
                        </span>
                      ))}
                    </div>
                  </div>
                </motion.div>
              </AnimatePresence>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}

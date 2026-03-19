import { useMemo, type CSSProperties } from 'react'
import { Link } from '@tanstack/react-router'
import { Button } from '#/components/ui/button'
import { ScrollReveal } from '#/components/ui/motion'
import { motion, AnimatePresence } from 'framer-motion'
import { toolList } from '#/lib/tools/registry'
import { cn } from '#/lib/utils'
import { toolAccentStyle } from '#/lib/tools/styleUtils'
import { useCarousel } from '#/hooks/useCarousel'

const groupLabels: Record<string, string> = {
  primary: 'Core workflow',
  application: 'Application assets',
  planning: 'Career planning',
}

const groupSupportCopy: Record<string, string> = {
  primary: 'Start here to create the shared signal the rest of the toolkit can reuse.',
  application: 'Carries the same resume evidence and role context straight into output you can use.',
  planning: 'Keeps your current baseline in view while turning gaps into concrete next steps.',
}

const previewImages: Record<string, string> = {
  resume: '/ai-generated/carousel/final-resume.png',
  'cover-letter': '/ai-generated/carousel/final-cover-letter.png',
  'job-match': '/ai-generated/carousel/final-job-match.png',
  career: '/ai-generated/carousel/final-career.png',
  interview: '/ai-generated/carousel/final-interview.png',
  portfolio: '/ai-generated/carousel/final-portfolio.png',
}

const previewImageStyles: Record<
  string,
  { scale?: number; x?: string; y?: string }
> = {
  resume: { scale: 1.12, x: '0%', y: '1%' },
  'cover-letter': { scale: 1.08, x: '1%', y: '1%' },
  'job-match': { scale: 1.1, x: '0%', y: '0%' },
  career: { scale: 1.18, x: '0%', y: '1%' },
  interview: { scale: 1.08, x: '0%', y: '0%' },
  portfolio: { scale: 1.12, x: '0%', y: '0%' },
}

function getContextPills(group: string, supportsJobImport: boolean) {
  if (group === 'application') {
    return ['Resume evidence', 'Role details', 'Ready-to-use output']
  }

  if (group === 'planning') {
    return ['Resume baseline', 'Gap signals', 'Next-step roadmap']
  }

  return supportsJobImport
    ? ['Resume context', 'Target role', 'Gap analysis']
    : ['Resume context', 'Shared signal', 'Priority fixes']
}

export function LandingToolGrid() {
  const { activeIndex: carouselIndex, goTo, hoverHandlers } = useCarousel(toolList.length, {
    interval: 4200,
    cooldown: 7000,
  })
  const activeTool = toolList[carouselIndex] || toolList[0]
  const activeIndex = carouselIndex + 1
  const contextPills = getContextPills(activeTool.group, activeTool.supportsJobImport)
  const previewImage = previewImages[activeTool.id]
  const previewImageStyle = useMemo(
    () => previewImageStyles[activeTool.id] || {},
    [activeTool.id],
  )

  return (
    <section className="landing-section landing-section-tools" id="landing-tools">
      <div className="content-max grid gap-5">
        <ScrollReveal>
          <div className="landing-section-heading landing-section-heading--tools">
            <p className="eyebrow">The toolkit</p>
            <h2 className="display-lg">Six tools. One shared context.</h2>
            <p className="muted-copy landing-tool-intro">
              Start with your resume, branch into live application work, then keep planning from the
              same signal instead of repeating yourself in every step.
            </p>
          </div>
        </ScrollReveal>
        <div className="landing-tool-showcase" {...hoverHandlers}>
          <div
            className="landing-preview-panel glass-elevated"
            style={toolAccentStyle(activeTool.accent)}
          >
            <AnimatePresence mode="wait">
              <motion.div
                key={activeTool.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ duration: 0.25 }}
                className="landing-preview-shell"
              >
                <div className="landing-preview-header">
                  <div className="landing-preview-header-top">
                    <p className="eyebrow">{groupLabels[activeTool.group] || 'Toolkit'}</p>
                    <div className="landing-preview-pills">
                      <span className="landing-preview-pill">0{activeIndex} / 06</span>
                    </div>
                  </div>
                  <h3 className="display-lg">{activeTool.label}</h3>
                  <p className="muted-copy landing-preview-summary">{activeTool.summary}</p>
                  <div className="landing-preview-context-pills landing-preview-context-pills--inline">
                    {contextPills.map((pill) => (
                      <span key={pill} className="landing-preview-context-pill">
                        {pill}
                      </span>
                    ))}
                  </div>
                </div>

                <div className="landing-preview-demo-window glass">
                  <div className="landing-preview-demo-bar">
                    <div className="landing-preview-demo-dots" aria-hidden="true">
                      <span />
                      <span />
                      <span />
                    </div>
                    <span className="landing-preview-demo-label">{activeTool.entryPointLabel}</span>
                  </div>

                  <div className="landing-preview-demo-frame">
                    <img
                      src={previewImage}
                      alt={`${activeTool.label} workspace preview`}
                      className="landing-preview-demo-image"
                      draggable={false}
                      style={
                        {
                          '--preview-scale': previewImageStyle.scale ?? 1,
                          '--preview-offset-x': previewImageStyle.x ?? '0%',
                          '--preview-offset-y': previewImageStyle.y ?? '0%',
                        } as CSSProperties
                      }
                    />
                    <div className="landing-preview-demo-image-tint" aria-hidden="true" />
                    <div className="landing-preview-demo-caption">
                      <span className="landing-preview-demo-chip is-accent">
                        {activeTool.shortLabel}
                      </span>
                      <span className="landing-preview-demo-chip">
                        {contextPills[contextPills.length - 1]}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="landing-preview-footer">
                  <div className="landing-preview-footer-copy">
                    <p className="landing-preview-footnote">
                      {groupSupportCopy[activeTool.group] || groupSupportCopy.primary}
                    </p>
                  </div>
                  <Button asChild className="button-hero-primary landing-preview-cta" size="lg">
                    <Link to={activeTool.route}>Open {activeTool.shortLabel}</Link>
                  </Button>
                </div>
              </motion.div>
            </AnimatePresence>
          </div>

          <div className="landing-tool-cards">
            {toolList.map((tool, index) => (
              <button
                key={tool.id}
                type="button"
                className={cn(
                  'landing-tool-card glass',
                  tool.id === activeTool.id && 'is-active',
                )}
                onClick={() => goTo(index)}
                style={toolAccentStyle(tool.accent)}
              >
                <div
                  className="landing-tool-card-icon"
                  style={{
                    background: `color-mix(in srgb, ${tool.accent} 14%, transparent)`,
                  }}
                >
                  <tool.icon size={18} style={{ color: tool.accent }} />
                </div>
                <div className="landing-tool-card-copy">
                  <h3 className="section-title">{tool.label}</h3>
                  <p className="small-copy muted-copy">{tool.summary}</p>
                </div>
              </button>
            ))}
          </div>
        </div>
      </div>
    </section>
  )
}

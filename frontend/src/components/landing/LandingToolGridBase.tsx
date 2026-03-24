import { useMemo, type CSSProperties } from 'react'
import { Link } from '@tanstack/react-router'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { Button } from '#/components/ui/button'
import { ScrollReveal } from '#/components/ui/motion'
import { useCarousel } from '#/hooks/useCarousel'
import { toolList, type ToolId } from '#/lib/tools/registry'
import { toolAccentStyle } from '#/lib/tools/styleUtils'
import { cn } from '#/lib/utils'

export type LandingToolGridCopy = {
  eyebrow: string
  title: string
  body: string
}

const defaultCopy: LandingToolGridCopy = {
  eyebrow: 'The toolkit',
  title: 'Six tools. One steady workflow.',
  body: 'Pick the move you need next without losing the resume, role, or edits already in progress.',
}

const groupLabels: Record<string, string> = {
  primary: 'Resume review',
  application: 'Application work',
  planning: 'Career planning',
}

const previewImages: Record<ToolId, string> = {
  resume: '/ai-generated/carousel/final-resume.png',
  'cover-letter': '/ai-generated/carousel/final-cover-letter.png',
  'job-match': '/ai-generated/carousel/final-job-match.png',
  career: '/ai-generated/carousel/final-career.png',
  interview: '/ai-generated/carousel/final-interview.png',
  portfolio: '/ai-generated/carousel/final-portfolio.png',
}

const previewImageStyles: Record<ToolId, { scale?: number; x?: string; y?: string }> = {
  resume: { scale: 1.12, x: '0%', y: '1%' },
  'cover-letter': { scale: 1.08, x: '1%', y: '1%' },
  'job-match': { scale: 1.1, x: '0%', y: '0%' },
  career: { scale: 1.18, x: '0%', y: '1%' },
  interview: { scale: 1.08, x: '0%', y: '0%' },
  portfolio: { scale: 1.12, x: '0%', y: '0%' },
}

const baseToolCopy: Record<ToolId, { summary: string; entryPointLabel: string }> = {
  resume: {
    summary: 'Score the draft and get the first fixes worth making.',
    entryPointLabel: 'Resume review',
  },
  'job-match': {
    summary: 'Compare one role to your resume and spot what is missing.',
    entryPointLabel: 'Role fit',
  },
  'cover-letter': {
    summary: 'Draft a letter that already reflects your experience and target role.',
    entryPointLabel: 'Cover letter',
  },
  interview: {
    summary: 'Practice likely questions with stronger answer angles.',
    entryPointLabel: 'Interview prep',
  },
  career: {
    summary: 'Compare paths, timelines, and the skills still worth building.',
    entryPointLabel: 'Career paths',
  },
  portfolio: {
    summary: 'Turn missing proof into project ideas you can actually build.',
    entryPointLabel: 'Portfolio plan',
  },
}

function getContextPills(group: string, supportsJobImport: boolean) {
  if (group === 'application') {
    return ['Resume', 'Role', 'Output']
  }

  if (group === 'planning') {
    return ['Gaps', 'Options', 'Roadmap']
  }

  return supportsJobImport
    ? ['Resume', 'Target role', 'Gap map']
    : ['Resume', 'Top proof', 'Next edits']
}

export function LandingToolGridBase({
  copy = defaultCopy,
  autoRotate = true,
}: {
  copy?: LandingToolGridCopy
  autoRotate?: boolean
} = {}) {
  const prefersReducedMotion = useReducedMotion() ?? false
  const { activeIndex: carouselIndex, goTo, hoverHandlers } = useCarousel(toolList.length, {
    interval: 4200,
    cooldown: 7000,
    enabled: autoRotate && !prefersReducedMotion,
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
      <div className="content-max grid gap-5 landing-experiment-surface landing-experiment-surface--tools">
        <ScrollReveal>
          <div className="landing-section-heading landing-section-heading--tools">
            <p className="eyebrow">{copy.eyebrow}</p>
            <h2 className="display-lg">{copy.title}</h2>
            <p className="muted-copy landing-tool-intro">{copy.body}</p>
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
                initial={prefersReducedMotion ? false : { opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={prefersReducedMotion ? undefined : { opacity: 0, y: -6 }}
                transition={{ duration: prefersReducedMotion ? 0 : 0.18 }}
                className="landing-preview-shell"
              >
                <div className="landing-preview-header">
                  <div className="landing-preview-header-top">
                    <p className="eyebrow">{groupLabels[activeTool.group] || 'Toolkit'}</p>
                    <span className="landing-preview-pill">0{activeIndex} / 06</span>
                  </div>
                  <h3 className="display-lg">{activeTool.label}</h3>
                  <p className="muted-copy landing-preview-summary">
                    {baseToolCopy[activeTool.id].summary}
                  </p>
                </div>

                <div className="landing-preview-demo-window glass">
                  <div className="landing-preview-demo-bar">
                    <div className="landing-preview-demo-dots" aria-hidden="true">
                      <span />
                      <span />
                      <span />
                    </div>
                    <span className="landing-preview-demo-label">
                      {baseToolCopy[activeTool.id].entryPointLabel}
                    </span>
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
                  </div>
                </div>

                <div className="landing-preview-footer">
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
                className={cn('landing-tool-card glass', tool.id === activeTool.id && 'is-active')}
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
                  <p className="small-copy muted-copy">{baseToolCopy[tool.id].summary}</p>
                </div>
              </button>
            ))}
          </div>
        </div>
      </div>
    </section>
  )
}

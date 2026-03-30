import { useMemo, type CSSProperties } from 'react'
import { Link } from '@tanstack/react-router'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { ScrollStagger, ScrollStaggerItem } from '#/components/ui/motion'
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
  resume: '/ai-generated/carousel/final-resume.webp',
  'cover-letter': '/ai-generated/carousel/final-cover-letter.webp',
  'job-match': '/ai-generated/carousel/final-job-match.webp',
  career: '/ai-generated/carousel/final-career.webp',
  interview: '/ai-generated/carousel/final-interview.webp',
  portfolio: '/ai-generated/carousel/final-portfolio.webp',
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
        <ScrollStagger className="landing-section-heading landing-section-heading--tools" stagger={0.1}>
          <ScrollStaggerItem>
            <p className="eyebrow">{copy.eyebrow}</p>
          </ScrollStaggerItem>
          <ScrollStaggerItem>
            <h2 className="display-lg">{copy.title}</h2>
          </ScrollStaggerItem>
          {copy.body ? <ScrollStaggerItem><p className="muted-copy landing-tool-intro">{copy.body}</p></ScrollStaggerItem> : null}
        </ScrollStagger>
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
                    <h3 className="display-lg" style={{ margin: 0 }}>{activeTool.label}</h3>
                    <span className="landing-preview-pill">{activeIndex} of 6</span>
                  </div>
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

                  <Link to="/dashboard" className="landing-preview-demo-frame block cursor-pointer">
                    <img
                      src={previewImage}
                      alt={`${activeTool.label} workspace preview`}
                      className="landing-preview-demo-image"
                      loading="lazy"
                      decoding="async"
                      draggable={false}
                    />
                  </Link>
                </div>

              </motion.div>
            </AnimatePresence>
          </div>

          <ScrollStagger className="landing-tool-cards" stagger={0.08}>
            {toolList.map((tool, index) => (
              <ScrollStaggerItem key={tool.id}>
                <button
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
              </ScrollStaggerItem>
            ))}
          </ScrollStagger>
        </div>
      </div>
    </section>
  )
}

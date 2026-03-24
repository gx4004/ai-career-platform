import { useMemo, useState, type CSSProperties } from 'react'
import { ScrollReveal } from '#/components/ui/motion'
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion'
import { tools, type ToolId } from '#/lib/tools/registry'
import { cn } from '#/lib/utils'
import { toolAccentStyle } from '#/lib/tools/styleUtils'
import {
  landingToolCopy,
  landingToolsCopy,
  landingWorkflowPhases,
  landingWorkflowToolIds,
} from '#/components/landing/landingContent'

const previewImages: Record<ToolId, string> = {
  resume: '/ai-generated/carousel/final-resume.png',
  'cover-letter': '/ai-generated/carousel/final-cover-letter.png',
  'job-match': '/ai-generated/carousel/final-job-match.png',
  career: '/ai-generated/carousel/final-career.png',
  interview: '/ai-generated/carousel/final-interview.png',
  portfolio: '/ai-generated/carousel/final-portfolio.png',
}

const previewImageStyles: Record<ToolId, { scale?: number; x?: string; y?: string }> = {
  resume: { scale: 1.02 },
  'cover-letter': { scale: 1.02, x: '1%' },
  'job-match': { scale: 1.04 },
  career: { scale: 1.05, y: '-1%' },
  interview: { scale: 1.02 },
  portfolio: { scale: 1.02, y: '-1%' },
}

export function LandingToolGrid() {
  const [activeToolId, setActiveToolId] = useState<ToolId>(landingWorkflowToolIds[0])
  const prefersReducedMotion = useReducedMotion() ?? false
  const orderedTools = useMemo(() => landingWorkflowToolIds.map((toolId) => tools[toolId]), [])
  const activeTool = tools[activeToolId]
  const activeToolMeta = landingToolCopy[activeToolId]
  const activeIndex = orderedTools.findIndex((tool) => tool.id === activeToolId) + 1
  const previewImage = previewImages[activeToolId]
  const previewImageStyle = useMemo(
    () => previewImageStyles[activeToolId] || {},
    [activeToolId],
  )

  return (
    <section className="landing-section landing-section-tools" id="landing-tools">
      <div className="content-max grid gap-5">
        <ScrollReveal>
          <div className="landing-section-heading landing-section-heading--tools">
            <p className="eyebrow">{landingToolsCopy.eyebrow}</p>
            <h2 className="display-lg">{landingToolsCopy.title}</h2>
            <p className="muted-copy landing-tool-intro">{landingToolsCopy.body}</p>
          </div>
        </ScrollReveal>
        <div className="landing-tool-showcase">
          <div
            className="landing-preview-panel glass-elevated"
            style={toolAccentStyle(activeTool.accent)}
          >
            <AnimatePresence mode="wait">
              <motion.div
                key={activeTool.id}
                initial={prefersReducedMotion ? false : { opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={prefersReducedMotion ? undefined : { opacity: 0, y: -8 }}
                transition={{ duration: prefersReducedMotion ? 0 : 0.2 }}
                className="landing-preview-shell"
              >
                <div className="landing-preview-header">
                  <div className="landing-preview-header-top">
                    <p className="eyebrow">{activeToolMeta.phase}</p>
                    <div className="landing-preview-pills">
                      <span className="landing-preview-pill">0{activeIndex} / 06</span>
                      <span className="landing-preview-pill is-accent">{activeTool.shortLabel}</span>
                    </div>
                  </div>
                  <h3 className="display-lg">{activeTool.label}</h3>
                  <p className="muted-copy landing-preview-summary">{activeToolMeta.summary}</p>
                  <div className="landing-preview-context-pills landing-preview-context-pills--inline">
                    {activeToolMeta.contextPills.map((pill) => (
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
                        {activeToolMeta.contextPills[activeToolMeta.contextPills.length - 1]}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="landing-preview-footer">
                  <div className="landing-preview-footer-copy">
                    <p className="landing-preview-footnote">{activeToolMeta.footnote}</p>
                  </div>
                </div>
              </motion.div>
            </AnimatePresence>
          </div>

          <div className="landing-tool-cards">
            {landingWorkflowPhases.map((phase) => (
              <section key={phase.id} className="landing-tool-phase">
                <div className="landing-tool-phase-head">
                  <p className="landing-tool-phase-eyebrow">{phase.eyebrow}</p>
                  <h3 className="landing-tool-phase-title">{phase.label}</h3>
                  <p className="landing-tool-phase-copy">{phase.description}</p>
                </div>
                <div className="landing-tool-phase-cards">
                  {phase.toolIds.map((toolId) => {
                    const tool = tools[toolId]
                    const toolMeta = landingToolCopy[toolId]

                    return (
                      <button
                        key={tool.id}
                        type="button"
                        className={cn(
                          'landing-tool-card glass',
                          tool.id === activeTool.id && 'is-active',
                        )}
                        onClick={() => setActiveToolId(tool.id)}
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
                          <p className="landing-tool-card-phase">{phase.label}</p>
                          <h3 className="section-title">{tool.label}</h3>
                          <p className="small-copy muted-copy">{toolMeta.summary}</p>
                        </div>
                      </button>
                    )
                  })}
                </div>
              </section>
            ))}
          </div>
        </div>
      </div>
    </section>
  )
}

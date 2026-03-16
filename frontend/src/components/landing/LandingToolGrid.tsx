import { useState, useRef, useEffect, useCallback } from 'react'
import { Link } from '@tanstack/react-router'
import { Button } from '#/components/ui/button'
import { ProofCard } from '#/components/illustrations/ProofCard'
import { ScrollReveal } from '#/components/ui/motion'
import { motion, AnimatePresence } from 'framer-motion'
import { toolList } from '#/lib/tools/registry'
import { WorkbenchArt } from '#/components/illustrations/WorkbenchArt'
import { cn } from '#/lib/utils'
import { toolAccentStyle } from '#/lib/tools/styleUtils'

type ShowcaseProof = {
  value?: string
  valueLabel?: string
  progress?: number
  rows?: Array<{ label: string; value: string }>
  chips?: Array<{ label: string; tone?: 'neutral' | 'success' | 'warning' }>
  previewLines?: string[]
}

const proofData: Record<string, ShowcaseProof> = {
  resume: {
    value: '84',
    valueLabel: '/ 100',
    progress: 84,
    rows: [
      { label: 'Key strengths', value: '5' },
      { label: 'Priority fixes', value: '3' },
    ],
  },
  'job-match': {
    value: '91%',
    progress: 91,
    rows: [
      { label: 'Matched skills', value: '8 / 10' },
      { label: 'Gaps to close', value: '2' },
    ],
  },
  'cover-letter': {
    previewLines: [
      'Opening tailored to the selected company.',
      'Evidence points anchored in resume bullets.',
      'Closing shifts naturally into interview prep.',
    ],
  },
  interview: {
    rows: [
      { label: 'Practice questions', value: '10' },
      { label: 'Suggested answers', value: 'Ready' },
    ],
    chips: [{ label: 'Behavioral' }, { label: 'Role-specific', tone: 'success' as const }],
  },
  career: {
    rows: [
      { label: 'Directions compared', value: '3' },
      { label: 'Timeline view', value: 'Included' },
    ],
    chips: [{ label: 'Skill gaps' }, { label: 'Transition plan', tone: 'success' as const }],
  },
  portfolio: {
    rows: [
      { label: 'Project ideas', value: '5' },
      { label: 'Skill coverage', value: 'Mapped' },
    ],
    chips: [{ label: 'Role-based' }, { label: 'Portfolio-ready', tone: 'success' as const }],
  },
}

export function LandingToolGrid() {
  const [activeToolId, setActiveToolId] = useState(toolList[0].id)
  const [userOverride, setUserOverride] = useState(false)
  const activeTool = toolList.find((t) => t.id === activeToolId) || toolList[0]
  const proofContent = proofData[activeTool.id] || {}
  const cardRefs = useRef(new Map<string, HTMLButtonElement>())
  const overrideTimeout = useRef<ReturnType<typeof setTimeout>>(undefined)

  useEffect(() => {
    const cards = cardRefs.current
    if (cards.size === 0) return

    const observer = new IntersectionObserver(
      (entries) => {
        if (userOverride) return
        for (const entry of entries) {
          if (entry.isIntersecting) {
            const id = entry.target.getAttribute('data-tool-id')
            if (id) setActiveToolId(id as typeof activeToolId)
          }
        }
      },
      { rootMargin: '-30% 0px -30% 0px', threshold: 0 },
    )

    cards.forEach((el) => observer.observe(el))
    return () => observer.disconnect()
  }, [userOverride])

  const handleClick = useCallback((toolId: string, el: HTMLButtonElement | null) => {
    setActiveToolId(toolId as typeof activeToolId)
    setUserOverride(true)
    el?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
    clearTimeout(overrideTimeout.current)
    overrideTimeout.current = setTimeout(() => setUserOverride(false), 1000)
  }, [])

  return (
    <section className="landing-section">
      <div className="content-max grid gap-5">
        <ScrollReveal>
          <div className="landing-section-heading">
            <p className="eyebrow">Tool showcase</p>
            <h2 className="display-lg">A connected suite instead of isolated utilities.</h2>
          </div>
        </ScrollReveal>
        <div className="landing-tool-showcase">
          <div className="landing-preview-panel glass-elevated">
            <AnimatePresence mode="wait">
              <motion.div
                key={activeTool.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ duration: 0.25 }}
                className="grid h-full gap-5"
              >
                <div className="grid gap-2">
                  <p className="eyebrow">{activeTool.group}</p>
                  <h3 className="display-lg">{activeTool.label}</h3>
                  <p className="muted-copy">{activeTool.summary}</p>
                </div>
                <div className="landing-preview-proof">
                  <div className="landing-preview-art">
                    <WorkbenchArt accent={activeTool.accent} variant="tool" />
                  </div>
                  <ProofCard
                    compact
                    className="landing-preview-proof-card"
                    icon={activeTool.icon}
                    accent={activeTool.accent}
                    eyebrow={`${activeTool.shortLabel} output`}
                    title={`See what ${activeTool.shortLabel.toLowerCase()} returns`}
                    value={proofContent.value}
                    valueLabel={proofContent.valueLabel}
                    progress={proofContent.progress}
                    rows={proofContent.rows}
                    chips={proofContent.chips}
                    previewLines={proofContent.previewLines}
                  />
                </div>
                <Button asChild className="button-hero-primary w-fit">
                  <Link to={activeTool.route}>Open {activeTool.shortLabel}</Link>
                </Button>
              </motion.div>
            </AnimatePresence>
          </div>

          <div className="landing-tool-cards">
            {toolList.map((tool) => (
              <button
                key={tool.id}
                type="button"
                ref={(el) => { if (el) cardRefs.current.set(tool.id, el) }}
                data-tool-id={tool.id}
                className={cn(
                  'landing-tool-card glass',
                  tool.id === activeToolId && 'is-active',
                )}
                onClick={() => handleClick(tool.id, cardRefs.current.get(tool.id) ?? null)}
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

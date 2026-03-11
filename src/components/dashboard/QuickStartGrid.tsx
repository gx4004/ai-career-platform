import { Link } from '@tanstack/react-router'
import { ArrowRight } from 'lucide-react'
import { StaggerChildren, StaggerItem } from '#/components/ui/motion'
import { type ToolId, toolList } from '#/lib/tools/registry'
import { toolAccentStyle } from '#/lib/tools/styleUtils'
import thumbResume from '#/assets/carousel/thumb-resume.png'
import thumbJobMatch from '#/assets/carousel/thumb-job-match.png'
import thumbCoverLetter from '#/assets/carousel/thumb-cover-letter.png'
import thumbInterview from '#/assets/carousel/thumb-interview.png'
import thumbCareer from '#/assets/carousel/thumb-career.png'
import thumbPortfolio from '#/assets/carousel/thumb-portfolio.png'

const TOOL_THUMBNAILS: Record<ToolId, string> = {
  resume: thumbResume,
  'job-match': thumbJobMatch,
  'cover-letter': thumbCoverLetter,
  interview: thumbInterview,
  career: thumbCareer,
  portfolio: thumbPortfolio,
}

export function QuickStartGrid() {
  return (
    <section className="grid gap-4">
      <div className="grid gap-1">
        <p className="eyebrow">Quick start</p>
        <h2 className="section-title">Six tools, one connected workflow</h2>
      </div>
      <StaggerChildren className="quick-start-grid" stagger={0.06} delay={0.05}>
        {toolList.map((tool) => (
            <StaggerItem key={tool.id}>
              <Link
                to={tool.route}
                className="quick-tool-card"
                style={toolAccentStyle(tool.accent)}
              >
                <div className="quick-tool-chrome">
                  <div className="hero-mockup-dots"><span /><span /><span /></div>
                  <span style={{ fontSize: 'var(--type-xs)', color: tool.accent }}>{tool.shortLabel}</span>
                </div>
                <img
                  src={TOOL_THUMBNAILS[tool.id]}
                  alt={tool.label}
                  className="quick-tool-thumbnail"
                  draggable={false}
                />
                <div className="flex items-center justify-between gap-3">
                  <div className="grid gap-2">
                    <h3 className="section-title">{tool.label}</h3>
                    <p className="muted-copy">{tool.summary}</p>
                  </div>
                  <ArrowRight
                    size={16}
                    className="quick-tool-card-arrow"
                    style={{ color: tool.accent }}
                  />
                </div>
              </Link>
            </StaggerItem>
          ))}
      </StaggerChildren>
    </section>
  )
}

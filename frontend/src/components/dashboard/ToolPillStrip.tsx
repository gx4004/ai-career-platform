import { Link } from '@tanstack/react-router'
import { Info } from 'lucide-react'
import { type ToolId, tools } from '#/lib/tools/registry'
import { readWorkflowContext } from '#/lib/tools/drafts'
import { FadeUp } from '#/components/ui/motion'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '#/components/ui/tooltip'

const SECONDARY_TOOL_IDS: ToolId[] = [
  'job-match',
  'cover-letter',
  'interview',
  'career',
  'portfolio',
]

const RESUME_DEPENDENT: Set<ToolId> = new Set([
  'job-match',
  'cover-letter',
  'interview',
  'career',
  'portfolio',
])

export function ToolPillStrip() {
  const context = readWorkflowContext()
  const hasResume = Boolean(context?.resumeText)

  const header = hasResume
    ? "What's next with your resume?"
    : 'Explore career tools'

  return (
    <FadeUp delay={0.25} className="pill-strip-section">
      <p className="pill-strip-header">{header}</p>
      <div className="pill-strip-row">
        <TooltipProvider delayDuration={300}>
          {SECONDARY_TOOL_IDS.map((id) => {
            const tool = tools[id]
            const Icon = tool.icon
            const needsResume = RESUME_DEPENDENT.has(id) && !hasResume

            return (
              <Tooltip key={id}>
                <TooltipTrigger asChild>
                  <Link
                    to={tool.route}
                    className={`pill-strip-pill${needsResume ? ' pill-strip-pill--hint' : ''}`}
                    style={{ '--tool-accent': tool.accent } as React.CSSProperties}
                  >
                    <Icon size={16} />
                    <span>{tool.shortLabel}</span>
                    {needsResume && (
                      <Info size={12} className="pill-strip-hint-icon" />
                    )}
                  </Link>
                </TooltipTrigger>
                <TooltipContent>
                  {needsResume
                    ? `Works better with a resume — ${tool.summary.toLowerCase()}`
                    : tool.summary}
                </TooltipContent>
              </Tooltip>
            )
          })}
        </TooltipProvider>
      </div>
    </FadeUp>
  )
}

import { HelpCircle } from 'lucide-react'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '#/components/ui/tooltip'
import type { ToolId } from '#/lib/tools/registry'

const SCORE_EXPLANATIONS: Record<string, string> = {
  resume: 'This score reflects the structural quality of your resume — sections, quantified achievements, clarity, and completeness. When a job description is provided, it measures role-specific fit instead.',
  'job-match': 'This score measures how well your resume matches the specific job requirements — keyword overlap, qualification coverage, and evidence alignment.',
  career: 'This score estimates your fit for each recommended career direction based on your current skills and experience.',
  portfolio: 'This score is not applicable for portfolio recommendations.',
}

export function ScoreTooltip({ toolId }: { toolId: ToolId }) {
  const explanation = SCORE_EXPLANATIONS[toolId]
  if (!explanation) return null

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button type="button" className="score-tooltip-trigger" aria-label="What does this score mean?">
          <HelpCircle size={14} />
        </button>
      </TooltipTrigger>
      <TooltipContent side="bottom" className="score-tooltip-content">
        <p>{explanation}</p>
      </TooltipContent>
    </Tooltip>
  )
}

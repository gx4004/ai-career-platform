import { CircleHelp } from 'lucide-react'
import { Button, Popover, PopoverContent, PopoverTrigger } from '#/components/kit'
import type { ToolId } from '#/lib/tools/registry'

const SCORE_EXPLANATIONS: Record<string, string> = {
  resume: 'This score reflects the structural quality of your resume — sections, quantified achievements, clarity, and completeness. When a job description is provided, it measures role-specific fit instead.',
  'job-match': 'This score measures how well your resume matches the specific job requirements — keyword overlap, qualification coverage, and evidence alignment.',
  career: 'This score estimates your fit for each recommended career direction based on your current skills and experience.',
  portfolio: 'This score is not applicable for portfolio recommendations.',
}

/** A tap-reachable explanation of the headline score (a tooltip would not open on touch). */
export function ScoreHelp({ toolId }: { toolId: ToolId }) {
  const explanation = SCORE_EXPLANATIONS[toolId]
  if (!explanation) return null

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button iconOnly variant="ghost" size="sm" aria-label="What does this score mean?">
          <CircleHelp aria-hidden="true" />
        </Button>
      </PopoverTrigger>
      <PopoverContent side="bottom" align="end">
        <p className="result-prose">{explanation}</p>
      </PopoverContent>
    </Popover>
  )
}

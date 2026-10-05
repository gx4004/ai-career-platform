import { CircleHelp } from 'lucide-react'
import { Button, Popover, PopoverContent, PopoverTrigger } from '#/components/kit'
import type { ToolId } from '#/lib/tools/registry'

const SCORE_EXPLANATIONS: Record<string, string> = {
  resume: 'This score reflects the quality of the resume itself: sections, quantified achievements, clarity and completeness. If you added a job description, role fit is shown separately under the breakdown.',
  'job-match': 'This score measures how well your resume matches the specific job requirements — keyword overlap, qualification coverage, and evidence alignment.',
  career: 'This score estimates your fit for the recommended direction from the skills and experience in your resume. The other paths have their own fit below.',
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

import { CareerToolPage } from '#/components/tooling/CareerToolPage'
import { CoverLetterToolPage } from '#/components/tooling/CoverLetterToolPage'
import { InterviewToolPage } from '#/components/tooling/InterviewToolPage'
import { JobMatchToolPage } from '#/components/tooling/JobMatchToolPage'
import { PortfolioToolPage } from '#/components/tooling/PortfolioToolPage'
import { ResumeToolPage } from '#/components/tooling/ResumeToolPage'
import type { ToolId } from '#/lib/tools/registry'

export function ToolRouteScreen({ toolId }: { toolId: ToolId }) {
  switch (toolId) {
    case 'resume':
      return <ResumeToolPage />
    case 'job-match':
      return <JobMatchToolPage />
    case 'cover-letter':
      return <CoverLetterToolPage />
    case 'interview':
      return <InterviewToolPage />
    case 'career':
      return <CareerToolPage />
    case 'portfolio':
      return <PortfolioToolPage />
    default:
      return null
  }
}

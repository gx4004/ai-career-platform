import { StaggerChildren, StaggerItem } from '#/components/ui/motion'
import { tools, type ToolId } from '#/lib/tools/registry'
import { DashboardShowcaseCard } from './DashboardShowcaseCard'

import thumbResume from '#/assets/carousel/resume.png'
import thumbJobMatch from '#/assets/carousel/jobmatch.png'
import thumbCoverLetter from '#/assets/carousel/coverletter.png'
import thumbInterview from '#/assets/carousel/interview.png'
import thumbCareer from '#/assets/carousel/career.png'
import thumbPortfolio from '#/assets/carousel/portfolio.png'

const showcaseTools: Array<{ id: ToolId; thumb: string }> = [
  { id: 'resume', thumb: thumbResume },
    { id: 'job-match', thumb: thumbJobMatch },
  { id: 'career', thumb: thumbCareer },
  { id: 'cover-letter', thumb: thumbCoverLetter },
  { id: 'interview', thumb: thumbInterview },
  { id: 'portfolio', thumb: thumbPortfolio },
]

export function DashboardShowcaseGrid() {
  return (
    <StaggerChildren className="dash-showcase-grid" stagger={0.06} delay={0.04}>
      {showcaseTools.map(({ id, thumb }) => {
        const tool = tools[id]
        return (
          <StaggerItem key={id}>
            <DashboardShowcaseCard
              label={tool.label}
              summary={tool.summary}
              route={tool.route}
              icon={tool.icon}
              accent={tool.accent}
              thumbSrc={thumb}
            />
          </StaggerItem>
        )
      })}
    </StaggerChildren>
  )
}

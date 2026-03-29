import { StaggerChildren, StaggerItem, ScrollReveal } from '#/components/ui/motion'
import { tools, type ToolId } from '#/lib/tools/registry'
import { useBreakpoint } from '#/hooks/use-breakpoint'
import { DashboardShowcaseCard } from './DashboardShowcaseCard'

import iconResume from '#/assets/tools/resume.png'
import iconJobMatch from '#/assets/tools/job-match.png'
import iconCareer from '#/assets/tools/career.png'
import iconCoverLetter from '#/assets/tools/cover-letter.png'
import iconInterview from '#/assets/tools/interview.png'
import iconPortfolio from '#/assets/tools/portfolio.png'

const showcaseTools: Array<{ id: ToolId; icon: string }> = [
  { id: 'resume', icon: iconResume },
  { id: 'job-match', icon: iconJobMatch },
  { id: 'career', icon: iconCareer },
  { id: 'cover-letter', icon: iconCoverLetter },
  { id: 'interview', icon: iconInterview },
  { id: 'portfolio', icon: iconPortfolio },
]

export function DashboardShowcaseGrid() {
  const bp = useBreakpoint()
  const isMobile = bp === 'mobile'

  return (
    <div className="dash-showcase-grid">
      {showcaseTools.map(({ id, icon }, i) => {
        const tool = tools[id]
        const card = (
          <DashboardShowcaseCard
            label={tool.label}
            summary={tool.summary}
            route={tool.route}
            accent={tool.accent}
            iconSrc={icon}
          />
        )

        if (isMobile) {
          return (
            <ScrollReveal key={id} delay={i % 2 === 0 ? 0 : 0.08}>
              {card}
            </ScrollReveal>
          )
        }

        return (
          <StaggerChildren key={id} stagger={0.06} delay={0.04 + i * 0.06}>
            <StaggerItem>{card}</StaggerItem>
          </StaggerChildren>
        )
      })}
    </div>
  )
}

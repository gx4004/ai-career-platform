import { type ToolId, tools } from '#/lib/tools/registry'
import { StaggerChildren, StaggerItem } from '#/components/ui/motion'
import { DashboardToolCard } from './DashboardToolCard'

const TOOL_IDS: ToolId[] = [
  'job-match',
  'cover-letter',
  'interview',
  'career',
  'portfolio',
]

export function DashboardToolStack() {
  return (
    <StaggerChildren className="dashboard-tool-stack" stagger={0.06} delay={0.1}>
      {TOOL_IDS.map((id) => {
        const tool = tools[id]
        return (
          <StaggerItem key={id}>
            <DashboardToolCard
              label={tool.label}
              summary={tool.summary}
              route={tool.route}
              icon={tool.icon}
              accent={tool.accent}
              iconUrl={`/generated/tool-${id}.png`}
            />
          </StaggerItem>
        )
      })}
    </StaggerChildren>
  )
}

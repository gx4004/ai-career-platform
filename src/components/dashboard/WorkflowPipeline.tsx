import { ArrowRight } from 'lucide-react'
import { StaggerChildren, StaggerItem } from '#/components/ui/motion'
import { toolList } from '#/lib/tools/registry'
import { toolAccentStyle } from '#/lib/tools/styleUtils'

export function WorkflowPipeline() {
  return (
    <section className="dash-card p-6">
      <div className="grid gap-4">
        <div className="grid gap-1">
          <p className="eyebrow">Workflow pipeline</p>
          <h2 className="section-title">Recommended progression through the suite</h2>
        </div>
        <StaggerChildren className="workflow-pipeline" stagger={0.08}>
          {toolList.map((tool, index) => (
            <StaggerItem key={tool.id} className="flex items-center gap-0">
              <div
                className={`workflow-step${index === 0 ? ' workflow-step--active' : ''}`}
                style={toolAccentStyle(tool.accent)}
              >
                <tool.icon size={16} style={{ color: tool.accent }} />
                <span>{tool.shortLabel}</span>
              </div>
              {index < toolList.length - 1 && (
                <div className="workflow-connector">
                  <ArrowRight size={14} />
                </div>
              )}
            </StaggerItem>
          ))}
        </StaggerChildren>
      </div>
    </section>
  )
}

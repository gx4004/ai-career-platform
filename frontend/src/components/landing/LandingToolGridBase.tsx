import { ChevronRight } from 'lucide-react'
import { Link } from '@tanstack/react-router'
import { Panel, ToolTile } from '#/components/kit'
import { toolList, type ToolId } from '#/lib/tools/registry'

export type LandingToolGridCopy = {
  title: string
  body: string
}

const defaultCopy: LandingToolGridCopy = {
  title: 'Six focused tools. Zero context switching.',
  body: 'One resume, six sharp tools. They share the same context so your story stays consistent from first upload to final interview.',
}

/** One sentence per tool for the ruled list. */
const summaries: Record<ToolId, string> = {
  resume:
    'Deep-scan your resume for ATS compatibility, missing proof, and readability blind spots in under a minute.',
  'job-match':
    'Paste any job description and see exactly where you match, where you gap, and which keywords are hurting your score.',
  career: 'Map the next 2–3 moves from your current skills and target market, with honest timelines.',
  'cover-letter':
    'Context-aware cover letters that pull from your real proof. No recycled phrases, no filler.',
  interview: 'Role-specific behavioral prep with STAR-method answer scaffolds you can actually rehearse.',
  portfolio:
    'Turn missing proof into concrete case-study ideas that map back to the metrics recruiters look for.',
}

/** The six tools as a ruled list in one white panel. Every row opens its own tool. */
export function LandingToolGridBase({ copy = defaultCopy }: { copy?: LandingToolGridCopy } = {}) {
  return (
    <section className="lp-section" id="landing-tools" aria-labelledby="landing-tools-heading">
      <div className="lp-wrap">
        <div className="lp-section__head">
          <h2 className="lp-display lp-display--l" id="landing-tools-heading">
            {copy.title}
          </h2>
          {copy.body ? <p className="lp-body-l">{copy.body}</p> : null}
        </div>

        <Panel flush>
          <ul className="lp-tools-list">
            {toolList.map((tool) => (
              <li key={tool.id}>
                <Link to={tool.route} className="lp-tool-row">
                  <ToolTile size="index" tone={tool.tone} icon={tool.icon} />
                  <h3 className="lp-tool-title">{tool.label}</h3>
                  <p className="lp-tool-summary">{summaries[tool.id]}</p>
                  <ChevronRight className="lp-tool-chevron" aria-hidden="true" />
                </Link>
              </li>
            ))}
          </ul>
        </Panel>
      </div>
    </section>
  )
}

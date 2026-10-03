import { ArrowUpRight } from 'lucide-react'
import { Link } from '@tanstack/react-router'
import { toolList, type ToolId } from '#/lib/tools/registry'

export type LandingToolGridCopy = {
  eyebrow: string
  title: string
  body: string
}

const defaultCopy: LandingToolGridCopy = {
  eyebrow: 'The toolkit',
  title: 'Six focused tools. Zero context switching.',
  body: 'One resume, six sharp tools. They share the same context so your story stays consistent from first upload to final interview.',
}

type ToolMeta = {
  summary: string
  bullets: [string, string, string]
  phase: 'Review' | 'Apply' | 'Plan'
}

const meta: Record<ToolId, ToolMeta> = {
  resume: {
    summary: 'Deep-scan your resume for ATS compatibility, missing proof, and readability blind spots in under a minute.',
    bullets: ['ATS compatibility check', 'Impact & proof scoring', 'First three edits to make'],
    phase: 'Review',
  },
  'job-match': {
    summary: 'Paste any job description and see exactly where you match, where you gap, and which keywords are hurting your score.',
    bullets: ['Keyword gap analysis', 'Skills match %', 'Priority fixes per role'],
    phase: 'Review',
  },
  career: {
    summary: 'Map the next 2–3 moves from your current skills and target market — with honest timelines.',
    bullets: ['Path comparisons', 'Skill gaps flagged', 'Realistic timelines'],
    phase: 'Plan',
  },
  'cover-letter': {
    summary: 'Context-aware cover letters that pull from your real proof — no recycled phrases, no filler.',
    bullets: ['Role-specific hook', 'Proof-led body', 'Editable in one click'],
    phase: 'Apply',
  },
  interview: {
    summary: 'Role-specific behavioral prep with STAR-method answer scaffolds you can actually rehearse.',
    bullets: ['Behavioral + technical', 'STAR scaffolds', 'Weak-answer rewrites'],
    phase: 'Apply',
  },
  portfolio: {
    summary: 'Turn missing proof into concrete case-study ideas that map back to the metrics recruiters look for.',
    bullets: ['Case-study seeds', 'Recruiter metrics', 'Roadmap to build'],
    phase: 'Plan',
  },
}

export function LandingToolGridBase({
  copy = defaultCopy,
  autoRotate: _autoRotate = false,
}: {
  copy?: LandingToolGridCopy
  autoRotate?: boolean
} = {}) {
  return (
    <section className="lp-section lp-surface-lowest" id="landing-tools">
      <div className="lp-container">
        <div className="lp-tools-header">
          <p className="lp-tools-eyebrow">The toolkit · 06 tools</p>
          <h2 className="lp-section-h2">{copy.title}</h2>
          {copy.body ? <p className="lp-section-sub">{copy.body}</p> : null}
        </div>

        <ul className="lp-tools-list">
          {toolList.map((tool, index) => {
            const featured = index === 0
            const tm = meta[tool.id]
            return (
              <li key={tool.id}>
                <Link
                  to="/dashboard"
                  className={`lp-tool-card${featured ? ' lp-tool-card--featured' : ''}`}
                >
                  <span className="lp-tool-phase">
                    {tm.phase} · {String(index + 1).padStart(2, '0')} / 06
                  </span>
                  <h3 className="lp-tool-title">{tool.label}</h3>
                  <p className="lp-tool-summary">{tm.summary}</p>
                  {featured ? (
                    <>
                      <ul className="lp-tool-bullets">
                        {tm.bullets.map((b) => (
                          <li key={b}>{b}</li>
                        ))}
                      </ul>
                      <span className="lp-tool-featured-cta">
                        Start here
                        <ArrowUpRight aria-hidden="true" />
                      </span>
                    </>
                  ) : null}
                </Link>
              </li>
            )
          })}
        </ul>
      </div>
    </section>
  )
}

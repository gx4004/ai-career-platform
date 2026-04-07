import { ArrowUpRight } from 'lucide-react'
import { Link } from '@tanstack/react-router'
import { motion, useReducedMotion } from 'framer-motion'

const MotionLink = motion(Link)
import { toolList, type ToolId } from '#/lib/tools/registry'
import { useSpotlight } from '#/hooks/useSpotlight'

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

const accentClassByIndex = ['', 'is-accent-2', 'is-accent-3', '', 'is-accent-2', 'is-accent-3'] as const

export function LandingToolGridBase({
  copy = defaultCopy,
  autoRotate: _autoRotate = false,
}: {
  copy?: LandingToolGridCopy
  autoRotate?: boolean
} = {}) {
  const prefersReducedMotion = useReducedMotion() ?? false
  const spotlight = useSpotlight()

  const featured = toolList[0]
  const rest = toolList.slice(1)
  const FeaturedIcon = featured.icon

  return (
    <section className="lp-section lp-surface-lowest" id="landing-tools">
      <div className="lp-container">
        <motion.div
          className="lp-tools-header"
          initial={prefersReducedMotion ? false : { opacity: 0, y: 18 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.4 }}
          transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
        >
          <div className="lp-tools-header-top">
            <span className="lp-tools-eyebrow">The toolkit · 06 tools</span>
          </div>
          <h2 className="lp-section-h2">{copy.title}</h2>
          {copy.body ? <p className="lp-section-sub">{copy.body}</p> : null}
        </motion.div>

        <motion.div
          className="lp-tools-bento"
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, amount: 0.15 }}
          variants={{
            hidden: {},
            visible: { transition: { staggerChildren: 0.07 } },
          }}
        >
          {/* Featured: Resume Analyzer (spans 2 columns on desktop) */}
          <MotionLink
            to="/dashboard"
            className="lp-tool-card lp-tool-card--featured lp-spotlight"
            {...spotlight}
            variants={{
              hidden: prefersReducedMotion ? { opacity: 1 } : { opacity: 0, y: 22 },
              visible: {
                opacity: 1,
                y: 0,
                transition: { type: 'spring', stiffness: 110, damping: 20 },
              },
            }}
          >
            <div className="lp-tool-featured-head">
              <div className="lp-tool-icon lp-tool-icon--lg">
                <FeaturedIcon size={26} />
              </div>
              <span className="lp-tool-phase">{meta[featured.id].phase} · 01 / 06</span>
            </div>
            <h3 className="lp-tool-title lp-tool-title--lg">{featured.label}</h3>
            <p className="lp-tool-summary lp-tool-summary--lg">{meta[featured.id].summary}</p>
            <ul className="lp-tool-bullets">
              {meta[featured.id].bullets.map((b) => (
                <li key={b}>
                  <span className="lp-tool-bullet-dot" aria-hidden="true" />
                  {b}
                </li>
              ))}
            </ul>
            <div className="lp-tool-featured-cta">
              Start here
              <ArrowUpRight size={16} />
            </div>
          </MotionLink>

          {/* Rest of the tools */}
          {rest.map((tool, i) => {
            const Icon = tool.icon
            const realIndex = i + 1
            return (
              <MotionLink
                key={tool.id}
                to="/dashboard"
                className={`lp-tool-card lp-spotlight ${accentClassByIndex[realIndex] ?? ''}`}
                {...spotlight}
                variants={{
                  hidden: prefersReducedMotion ? { opacity: 1 } : { opacity: 0, y: 20 },
                  visible: {
                    opacity: 1,
                    y: 0,
                    transition: { type: 'spring', stiffness: 110, damping: 20 },
                  },
                }}
              >
                <div className="lp-tool-card-head">
                  <div className="lp-tool-icon">
                    <Icon size={20} />
                  </div>
                  <span className="lp-tool-phase">
                    {meta[tool.id].phase} · {String(realIndex + 1).padStart(2, '0')} / 06
                  </span>
                </div>
                <h3 className="lp-tool-title">{tool.label}</h3>
                <p className="lp-tool-summary">{meta[tool.id].summary}</p>
              </MotionLink>
            )
          })}
        </motion.div>
      </div>
    </section>
  )
}

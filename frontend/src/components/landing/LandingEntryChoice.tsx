import { ArrowRight, BriefcaseBusiness, ScanText } from 'lucide-react'
import { Link } from '@tanstack/react-router'
import { tools } from '#/lib/tools/registry'

/**
 * R7 candidate #110 — first-run entry choice (dark-shipped, default off).
 *
 * Renders an explicit "I have a resume" (resume-first) vs "I'm targeting a role"
 * (role-first) choice in place of the single generic landing CTA, routing to the
 * Resume Analyzer or Job Match tool respectively. Routes come from the tool
 * registry so this stays consistent with tool ordering and never hardcodes paths.
 *
 * This component is only mounted when `isR7EntryChoiceEnabled()` is true; the
 * caller keeps the unchanged single-CTA path when the flag is off.
 */
export function LandingEntryChoice() {
  const choices = [
    {
      key: 'resume-first',
      to: tools.resume.route,
      icon: ScanText,
      title: 'I have a resume',
      description: 'Score the resume you have and fix what recruiters notice first.',
    },
    {
      key: 'role-first',
      to: tools['job-match'].route,
      icon: BriefcaseBusiness,
      title: "I'm targeting a role",
      description: 'Start from a job description and see where your signal is thin.',
    },
  ] as const

  return (
    <div
      className="lp-entry-choice"
      role="group"
      aria-label="Choose how you want to start"
    >
      {choices.map(({ key, to, icon: Icon, title, description }) => (
        <Link key={key} to={to} className="lp-entry-choice-card" data-entry-choice={key}>
          <span className="lp-entry-choice-icon" aria-hidden="true">
            <Icon size={22} />
          </span>
          <span className="lp-entry-choice-title">
            {title}
            <ArrowRight size={16} aria-hidden="true" />
          </span>
          <span className="lp-entry-choice-desc">{description}</span>
        </Link>
      ))}
    </div>
  )
}

import { ArrowRight, BriefcaseBusiness, ScanText } from 'lucide-react'
import { Link } from '@tanstack/react-router'
import { landingEntryChoiceCopy } from '#/components/landing/landingContent'
import { tools } from '#/lib/tools/registry'

/**
 * R7 candidate #110 — first-run entry choice (dark-shipped, default off).
 *
 * Renders an explicit "I have a resume" (resume-first) vs "I'm targeting a role"
 * (role-first) choice in place of the single generic landing CTA, routing to the
 * Resume Analyzer or Job Match tool respectively. Copy comes from
 * `landingEntryChoiceCopy`; routes come from the tool registry so paths stay in
 * sync with canonical tool ordering and are never hardcoded here.
 *
 * This component is only mounted when `isR7EntryChoiceEnabled()` is true; the
 * caller keeps the unchanged single-CTA path when the flag is off.
 */
export function LandingEntryChoice() {
  const { ariaLabel, choices } = landingEntryChoiceCopy

  const options = [
    { key: 'resume-first', to: tools.resume.route, icon: ScanText, copy: choices['resume-first'] },
    { key: 'role-first', to: tools['job-match'].route, icon: BriefcaseBusiness, copy: choices['role-first'] },
  ] as const

  return (
    <div className="lp-entry-choice" role="group" aria-label={ariaLabel}>
      {options.map(({ key, to, icon: Icon, copy }) => (
        <Link key={key} to={to} className="lp-entry-choice-card" data-entry-choice={key}>
          <span className="lp-entry-choice-icon" aria-hidden="true">
            <Icon size={22} />
          </span>
          <span className="lp-entry-choice-title">
            {copy.title}
            <ArrowRight size={16} aria-hidden="true" />
          </span>
          <span className="lp-entry-choice-desc">{copy.description}</span>
        </Link>
      ))}
    </div>
  )
}

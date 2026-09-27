import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { CheckCircle2, ChevronDown, CircleAlert, RefreshCw, ShieldCheck } from 'lucide-react'
import { Button } from '#/components/ui/button'
import { StatusPill } from '#/components/app/WorkspacePage'
import { scoreCvDocument } from '#/lib/api/client'
import type { CvQualityResponse, CvTemplateId } from '#/lib/api/schemas'

export const qualityQueryKey = (documentId: string, revision: string, template: CvTemplateId) =>
  ['cv-studio', 'quality', documentId, revision, template] as const

/**
 * Pass/fail checks for the saved document, validated against the real PDF of
 * its saved style. Shared by the hero stat, the preview link and the panel
 * (one request). The template is in the key so a style change re-checks.
 */
export function useCvQuality(documentId: string, revision: string, template: CvTemplateId) {
  return useQuery({
    queryKey: qualityQueryKey(documentId, revision, template),
    queryFn: () => scoreCvDocument(documentId),
    enabled: Boolean(documentId && revision),
    placeholderData: keepPreviousData,
    staleTime: 60_000,
  })
}

/** "All 5 checks pass" / "2 to fix" — deliberately never a score (CONTEXT.md). */
export function checklistSummary(checks: CvQualityResponse['checks']) {
  const failing = checks.filter((check) => !check.passed).length
  if (failing === 0) return `All ${checks.length} checks pass`
  return `${failing} to fix`
}

/** Writing-quality bar colours from design.md: green 70+, amber 41–69, red 0–40. */
function barGradient(score: number) {
  if (score >= 70) return 'linear-gradient(90deg, #16a34a, #4ade80)'
  if (score >= 41) return 'linear-gradient(90deg, #d97706, #fbbf24)'
  return 'linear-gradient(90deg, #dc2626, #f87171)'
}

export function CvAtsPanel({ documentId, revision, template, atsMode, onTurnOnAtsMode }: {
  documentId: string; revision: string; template: CvTemplateId; atsMode: boolean; onTurnOnAtsMode: () => void
}) {
  const quality = useCvQuality(documentId, revision, template)

  if (quality.isPending) {
    return <div className="cvs-ats cvs-ats--loading" role="status" aria-label="Checking your CV"><span className="cvs-skeleton cvs-skeleton--lines" /><div className="cvs-ats__pending"><p className="cvs-ats__headline">Checking your CV…</p><p className="cvs-ats__note">We build the real PDF and read it back the way an application system would. This takes a few seconds.</p></div></div>
  }
  if (quality.isError) {
    return (
      <div className="cvs-inline-alert" role="alert">
        <p>We couldn’t run the ATS check just now. Your CV hasn’t changed.</p>
        <Button type="button" size="sm" variant="outline" onClick={() => void quality.refetch()}>Try again</Button>
      </div>
    )
  }

  const data = quality.data
  const layoutFails = data.checks.some((check) => check.id === 'layout' && !check.passed)

  return (
    <div className="cvs-ats" aria-busy={quality.isFetching || undefined}>
      <div className="cvs-ats__summary">
        <p className="cvs-ats__headline">{checklistSummary(data.checks)}</p>
        <p className="cvs-ats__note">Checked against the PDF you would send. Each check is pass or fail; none of them predicts interviews.</p>
        {quality.isFetching ? <p className="cvs-ats__refreshing" role="status"><RefreshCw size={13} aria-hidden="true" /> Updating…</p> : null}
        {layoutFails && !atsMode ? (
          <Button type="button" size="sm" variant="outline" onClick={onTurnOnAtsMode}><ShieldCheck size={15} /> Turn on ATS-friendly mode</Button>
        ) : null}
      </div>

      <ul className="cvs-check-list" aria-label="Checks">
        {data.checks.map((check) => {
          const Icon = check.passed ? CheckCircle2 : CircleAlert
          return (
            <li key={check.id} className={`cvs-check cvs-check--${check.passed ? 'pass' : 'fail'}`}>
              <Icon size={16} aria-hidden="true" className="cvs-check__icon" />
              <div>
                <p className="cvs-check__label">{check.label}</p>
                <p className="cvs-check__desc">{check.passed ? check.detail : check.fix}</p>
              </div>
              <StatusPill tone={check.passed ? 'positive' : 'danger'}>{check.passed ? 'Pass' : 'Fix'}</StatusPill>
            </li>
          )
        })}
      </ul>

      <details className="cvs-advanced">
        <summary><ChevronDown size={16} aria-hidden="true" /> Writing quality</summary>
        <ul className="cvs-writing__list">
          {data.dimensions.map((dimension) => (
            <li key={dimension.key}>
              <div className="cvs-writing__row">
                <span>{dimension.label}</span>
                <strong aria-label={`${dimension.label}: ${dimension.score} out of 100`}>{dimension.score}</strong>
              </div>
              <span className="cvs-bar" aria-hidden="true">
                <span style={{ width: `${dimension.score}%`, background: barGradient(dimension.score) }} />
              </span>
              <p>{dimension.remediation}</p>
            </li>
          ))}
        </ul>
      </details>
    </div>
  )
}

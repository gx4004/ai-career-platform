import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { CheckCircle2, CircleAlert, RefreshCw, ShieldCheck } from 'lucide-react'
import { Button } from '#/components/ui/button'
import { scoreCvDocument } from '#/lib/api/client'
import { sectionLabels } from '#/lib/cv-studio/editor'
import type { CvQualityResponse, CvSection, CvTemplateId } from '#/lib/api/schemas'

/**
 * Pass/fail checks for the saved document, validated against the real PDF of
 * its saved style. Shared by the toolbar summary and the panel (one request).
 * The template is in the key so a style change re-checks.
 */
export function useCvQuality(documentId: string, revision: string, template: CvTemplateId) {
  return useQuery({
    queryKey: ['cv-studio', 'quality', documentId, revision, template],
    queryFn: () => scoreCvDocument(documentId),
    enabled: Boolean(documentId && revision),
    placeholderData: keepPreviousData,
    staleTime: 60_000,
  })
}

/** "All 5 checks pass" / "2 to fix" — deliberately never a score (CONTEXT.md). */
export function checklistSummary(checks: CvQualityResponse['checks']) {
  const failing = checks.filter((check) => !check.passed).length
  return failing === 0 ? `All ${checks.length} checks pass` : `${failing} to fix`
}

/** The backend's "sections" check passes only when Experience and Skills are both visible. */
const REQUIRED_KINDS = ['experience', 'skills'] as const

export function CvAtsPanel({ quality, sections, atsMode, onTurnOnAtsMode, onAddSection, onShowSection }: {
  quality: ReturnType<typeof useCvQuality>; sections: CvSection[]; atsMode: boolean; onTurnOnAtsMode: () => void
  onAddSection: (kind: CvSection['kind']) => void; onShowSection: (sectionId: string) => void
}) {
  if (quality.isError) {
    return (
      <div className="cvs-inline-alert" role="alert">
        <p>We couldn’t run the ATS check just now. Your CV hasn’t changed.</p>
        <Button type="button" size="sm" variant="outline" onClick={() => void quality.refetch()}>Try again</Button>
      </div>
    )
  }
  if (!quality.data) return <p className="cvs-muted" role="status">Checking your CV… We build the real PDF and read it back the way an application system would.</p>

  const { checks } = quality.data
  const allPass = checks.every((check) => check.passed)
  const sectionsFail = checks.some((check) => check.id === 'sections' && !check.passed)
  const sectionFixes = sectionsFail
    ? REQUIRED_KINDS.filter((kind) => !sections.some((section) => section.kind === kind && section.visible)).map((kind) => ({
      kind, hidden: sections.find((section) => section.kind === kind && !section.visible),
    }))
    : []
  const layoutFails = checks.some((check) => check.id === 'layout' && !check.passed)
  return (
    <div className="cvs-ats" aria-busy={quality.isFetching || undefined}>
      <p className={`cvs-ats__headline cvs-ats__headline--${allPass ? 'pass' : 'fail'}`}>
        {allPass ? <ShieldCheck size={18} aria-hidden="true" /> : <CircleAlert size={18} aria-hidden="true" />}
        {checklistSummary(checks)}
      </p>
      <p className="cvs-muted">Checked against the PDF you’d send. Pass or fail only. Not a prediction.</p>
      {quality.isFetching ? <p className="cvs-ats__refreshing" role="status"><RefreshCw size={13} aria-hidden="true" /> Updating…</p> : null}
      <ul className="cvs-check-list" aria-label="Checks">
        {checks.map((check) => (
          <li key={check.id} className={`cvs-check cvs-check--${check.passed ? 'pass' : 'fail'}`}>
            {check.passed ? <CheckCircle2 size={16} aria-hidden="true" /> : <CircleAlert size={16} aria-hidden="true" />}
            <div>
              <p className="cvs-check__label">{check.label}<span className="sr-only">{check.passed ? ': passes' : ': to fix'}</span></p>
              <p className="cvs-check__desc">{check.passed ? check.detail : check.fix}</p>
            </div>
          </li>
        ))}
      </ul>
      {sectionFixes.map(({ kind, hidden }) => (
        <Button key={kind} type="button" size="sm" variant="outline" onClick={() => hidden ? onShowSection(hidden.id) : onAddSection(kind)}>
          {hidden ? 'Show' : 'Add'} {sectionLabels[kind]} section
        </Button>
      ))}
      {layoutFails && !atsMode ? (
        <Button type="button" size="sm" variant="outline" onClick={onTurnOnAtsMode}><ShieldCheck size={15} /> Turn on ATS-friendly mode</Button>
      ) : null}
    </div>
  )
}

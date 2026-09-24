import { useState } from 'react'
import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query'
import { CheckCircle2, ChevronDown, CircleAlert, CircleDashed, RefreshCw, ShieldCheck, Sparkles } from 'lucide-react'
import { Button } from '#/components/ui/button'
import { StatusPill } from '#/components/app/WorkspacePage'
import { scoreCvDocument } from '#/lib/api/client'
import type { CvQualityResponse, CvTemplateId } from '#/lib/api/schemas'
import { CHECK_COPY, friendlyAtsFixes } from '#/lib/cv-studio/catalog'
import { CvScoreRing, scoreGradient } from './CvScoreRing'

export const qualityQueryKey = (documentId: string, revision: string, template: CvTemplateId) =>
  ['cv-studio', 'quality', documentId, revision, template] as const

/**
 * ATS check for the saved document, validated against the real PDF for the
 * selected template. Shared by the hero stat and the panel (one request).
 */
export function useCvQuality(documentId: string, revision: string, template: CvTemplateId) {
  return useQuery({
    queryKey: qualityQueryKey(documentId, revision, template),
    queryFn: () => scoreCvDocument(documentId, { use_model: false, artifact_template: template, artifact_format: 'pdf' }),
    enabled: Boolean(documentId && revision),
    placeholderData: keepPreviousData,
    staleTime: 60_000,
  })
}

const STATUS_COPY = {
  pass: { label: 'Looks good', tone: 'positive' as const, icon: CheckCircle2 },
  review: { label: 'Worth a look', tone: 'warning' as const, icon: CircleAlert },
  fail: { label: 'Needs a fix', tone: 'danger' as const, icon: CircleAlert },
  not_run: { label: 'Not checked yet', tone: 'neutral' as const, icon: CircleDashed },
}

function verdict(score: number) {
  const tone = scoreGradient(score).tone
  if (tone === 'good') return 'Application systems should read this CV cleanly.'
  if (tone === 'medium') return 'Mostly readable. A couple of fixes will make it safer.'
  return 'Application systems may struggle with this CV. Start with the fixes below.'
}

export function CvAtsPanel({ documentId, revision, template, atsMode, onTurnOnAtsMode }: {
  documentId: string; revision: string; template: CvTemplateId; atsMode: boolean; onTurnOnAtsMode: () => void
}) {
  const queryClient = useQueryClient()
  const quality = useCvQuality(documentId, revision, template)
  const [secondOpinion, setSecondOpinion] = useState<'idle' | 'loading' | 'error' | 'limit'>('idle')

  async function askForSecondOpinion() {
    setSecondOpinion('loading')
    try {
      const result = await scoreCvDocument(documentId, { use_model: true })
      queryClient.setQueryData<CvQualityResponse>(qualityQueryKey(documentId, revision, template), (current) => current
        ? { ...current, dimensions: result.dimensions, scoring_mode: result.scoring_mode, remaining_model_runs: result.remaining_model_runs }
        : result)
      setSecondOpinion('idle')
    } catch (error) {
      setSecondOpinion(error instanceof Error && error.message.includes('model scoring limit') ? 'limit' : 'error')
    }
  }

  if (quality.isPending) {
    return <div className="cvs-ats cvs-ats--loading" role="status" aria-label="Checking your CV"><span className="cvs-skeleton cvs-skeleton--ring" /><div className="cvs-ats__pending"><p className="cvs-ats__headline">Checking your CV…</p><p className="cvs-ats__note">We build the real PDF and read it back the way an application system would. This takes a few seconds.</p></div></div>
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
  const fixes = friendlyAtsFixes(data)
  const reviews = data.ats_checks.filter((check) => check.status === 'review')
  const templateWarning = !atsMode && fixes.some((fix) => fix.startsWith('Your template uses two columns'))

  return (
    <div className="cvs-ats" aria-busy={quality.isFetching || undefined}>
      <div className="cvs-ats__summary">
        <CvScoreRing score={data.ats_score} label={`ATS score: ${data.ats_score} out of 100`} />
        <div className="cvs-ats__verdict">
          <p className="cvs-ats__headline">{verdict(data.ats_score)}</p>
          <p className="cvs-ats__note">Checked against the PDF you would send. This is a readability check, not a prediction of interviews.</p>
          {quality.isFetching ? <p className="cvs-ats__refreshing" role="status"><RefreshCw size={13} aria-hidden="true" /> Updating…</p> : null}
        </div>
      </div>

      <div className="cvs-ats__fixes">
        <p className="cvs-ats__label">{fixes.length > 0 ? `Fix ${fixes.length === 1 ? 'this' : 'these'} first` : 'Nothing to fix'}</p>
        {fixes.length > 0 ? (
          <ol className="cvs-fix-list">
            {fixes.map((fix) => <li key={fix}><CircleAlert size={15} aria-hidden="true" /><span>{fix}</span></li>)}
          </ol>
        ) : (
          <p className="cvs-ats__clean"><CheckCircle2 size={16} aria-hidden="true" /> Every check passed. Your CV reads cleanly.</p>
        )}
        {reviews.map((check) => (
          <p key={check.key} className="cvs-ats__review">Worth a look: {CHECK_COPY[check.key].label.toLowerCase()}.</p>
        ))}
        {templateWarning ? (
          <Button type="button" size="sm" variant="outline" onClick={onTurnOnAtsMode}><ShieldCheck size={15} /> Turn on ATS-friendly mode</Button>
        ) : null}
      </div>

      <details className="cvs-advanced">
        <summary><ChevronDown size={16} aria-hidden="true" /> Advanced checks</summary>
        <div className="cvs-advanced__body">
          <ul className="cvs-check-list" aria-label="Individual checks">
            {data.ats_checks.map((check) => {
              const status = STATUS_COPY[check.status]
              const Icon = status.icon
              return (
                <li key={check.key} className={`cvs-check cvs-check--${check.status}`}>
                  <Icon size={16} aria-hidden="true" className="cvs-check__icon" />
                  <div>
                    <p className="cvs-check__label">{CHECK_COPY[check.key].label}</p>
                    <p className="cvs-check__desc">{CHECK_COPY[check.key].description}</p>
                  </div>
                  <StatusPill tone={status.tone}>{status.label}</StatusPill>
                </li>
              )
            })}
          </ul>
          <div className="cvs-writing">
            <div className="cvs-writing__head">
              <p className="cvs-ats__label">Writing quality</p>
              <Button type="button" size="sm" variant="ghost" loading={secondOpinion === 'loading'} disabled={data.remaining_model_runs === 0} onClick={() => void askForSecondOpinion()}>
                <Sparkles size={14} /> Ask AI for a second opinion
              </Button>
            </div>
            <p className="cvs-ats__note">{data.remaining_model_runs} AI reviews left for this CV.</p>
            {secondOpinion === 'limit' ? <p className="cvs-inline-error" role="alert">You’ve used all AI reviews for this CV. The checks above still work.</p> : null}
            {secondOpinion === 'error' ? <p className="cvs-inline-error" role="alert">The AI review isn’t available right now. The checks above still work.</p> : null}
            <ul className="cvs-writing__list">
              {data.dimensions.map((dimension) => {
                const gradient = scoreGradient(dimension.score)
                return (
                  <li key={dimension.key}>
                    <div className="cvs-writing__row">
                      <span>{dimension.label}</span>
                      <strong aria-label={`${dimension.label}: ${dimension.score} out of 100`}>{dimension.score}</strong>
                    </div>
                    <span className="cvs-bar" aria-hidden="true">
                      <span style={{ width: `${dimension.score}%`, background: `linear-gradient(90deg, ${gradient.start}, ${gradient.end})` }} />
                    </span>
                    <p>{dimension.remediation}</p>
                  </li>
                )
              })}
            </ul>
          </div>
        </div>
      </details>
    </div>
  )
}

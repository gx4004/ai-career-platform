import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { Check, RefreshCw, TriangleAlert } from 'lucide-react'
import { Button } from '#/components/ui/button'
import { scoreCvDocument } from '#/lib/api/client'
import type { CvAtsCheckKey } from '#/lib/api/schemas'

export function CvQualityPanel({ documentId, revision }: { documentId: string; revision: string }) {
  const queryClient = useQueryClient()
  const [modelState, setModelState] = useState<'idle' | 'loading' | 'error'>('idle')
  const [checkState, setCheckState] = useState<{ key: CvAtsCheckKey; state: 'loading' | 'error' } | null>(null)
  const queryKey = ['cv-studio', 'quality', documentId, revision] as const
  const quality = useQuery({
    queryKey,
    queryFn: () => scoreCvDocument(documentId, { use_model: false }),
  })

  async function rerunCheck(key: CvAtsCheckKey) {
    setCheckState({ key, state: 'loading' })
    try {
      const result = await scoreCvDocument(documentId, { use_model: false, checks: [key] })
      queryClient.setQueryData<typeof result>(queryKey, (current) => current ? {
        ...current,
        ats_checks: current.ats_checks.map((check) => check.key === key ? result.ats_checks[0] : check),
      } : result)
      setCheckState(null)
    } catch {
      setCheckState({ key, state: 'error' })
    }
  }

  async function addModelPerspective() {
    setModelState('loading')
    try {
      const result = await scoreCvDocument(documentId, { use_model: true })
      queryClient.setQueryData(queryKey, result)
      setModelState('idle')
    } catch {
      setModelState('error')
    }
  }

  if (quality.isPending) return <div className="studio-quality-skeleton" aria-label="Checking document quality" />
  if (quality.isError) return <div className="studio-quality-error" role="alert"><p>Quality guidance could not be loaded. Your document was not changed.</p><Button type="button" size="sm" variant="outline" onClick={() => void quality.refetch()}>Try again</Button></div>
  const data = quality.data
  return <section className="studio-quality" aria-labelledby="studio-quality-title">
    <header className="studio-quality-head"><div><p className="eyebrow">Editing guidance</p><h2 id="studio-quality-title">Document quality</h2></div><div className="studio-quality-actions"><Button type="button" size="sm" variant="ghost" disabled={modelState === 'loading'} onClick={() => void addModelPerspective()}>{modelState === 'loading' ? 'Comparing…' : 'Add model perspective'}</Button><Button type="button" size="sm" variant="outline" disabled={quality.isFetching} onClick={() => void quality.refetch()}><RefreshCw size={15} /> Refresh</Button></div></header>
    {modelState === 'error' ? <p className="studio-inline-error" role="alert">The model perspective is unavailable. Deterministic scores and checks remain available.</p> : null}
    <p className="studio-quality-note">{data.advisory_note}</p>
    <div className="studio-dimensions">{data.dimensions.map((dimension) => <article key={dimension.key}>
      <div><h3>{dimension.label}</h3><strong aria-label={`${dimension.label}: ${dimension.score} out of 100`}>{dimension.score}<span>/100</span></strong></div>
      <ul>{dimension.reasons.map((reason) => <li key={reason}>{reason}</li>)}</ul><p><b>Next edit:</b> {dimension.remediation}</p>
    </article>)}</div>
    <div className="studio-checks"><div><p className="eyebrow">Deterministic checks</p><h3>Named compatibility checks</h3></div>{data.ats_checks.map((check) => <article key={check.key}>
      <span className={`studio-check-status studio-check-status--${check.status}`}>{check.status === 'pass' ? <Check /> : <TriangleAlert />}{check.status}</span>
      <div><h4>{check.label}</h4><p>{check.explanation}</p><p><b>Remediation:</b> {check.remediation}</p>{checkState?.key === check.key && checkState.state === 'error' ? <p className="studio-inline-error" role="alert">This check could not be rerun. The previous result remains visible.</p> : null}</div>
      <Button type="button" variant="ghost" size="sm" disabled={checkState?.key === check.key && checkState.state === 'loading'} onClick={() => void rerunCheck(check.key)}>{checkState?.key === check.key && checkState.state === 'loading' ? 'Checking…' : `Rerun ${check.label}`}</Button>
    </article>)}</div>
  </section>
}

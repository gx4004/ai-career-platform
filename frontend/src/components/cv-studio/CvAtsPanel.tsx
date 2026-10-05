import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { Download, ShieldCheck } from 'lucide-react'
import {
  Badge, Button, Cluster, Disclosure, List, Notice, Row, RowBody, RowMeta, RowSubtitle, RowTitle, Section, Skeleton, Stack,
} from '#/components/kit'
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

export function CvAtsPanel({
  quality, sections, atsMode, density, onTurnOnAtsMode, onCompactSpacing, onAddSection, onShowSection, onExportPdf, exporting, canExport,
}: {
  quality: ReturnType<typeof useCvQuality>; sections: CvSection[]; atsMode: boolean; density: string
  onTurnOnAtsMode: () => void; onCompactSpacing: () => void
  onAddSection: (kind: CvSection['kind']) => void; onShowSection: (sectionId: string) => void
  /** The one-click PDF once every check passes. */
  onExportPdf: () => void; exporting: boolean; canExport: boolean
}) {
  if (quality.isError) {
    return (
      <Notice tone="danger" action={<Button type="button" size="sm" variant="secondary" onClick={() => void quality.refetch()}>Try again</Button>}>
        We couldn’t run the ATS check just now. Your CV hasn’t changed.
      </Notice>
    )
  }
  if (!quality.data) {
    return (
      <Section headingLevel={3} title="Checking your CV…" description="We build the real PDF and read it back the way an application system would.">
        <List framed={false} aria-label="Checks" aria-busy="true" className="cvs-checks-skeleton"><Skeleton variant="row" as="li" count={5} /></List>
        <p className="kit-sr-only" role="status">Checking your CV…</p>
      </Section>
    )
  }

  const { checks } = quality.data
  const failing = checks.filter((check) => !check.passed)
  const ready = failing.length === 0
  const failed = (id: string) => failing.some((check) => check.id === id)
  const sectionFixes = failed('sections')
    ? REQUIRED_KINDS.filter((kind) => !sections.some((section) => section.kind === kind && section.visible)).map((kind) => ({
      kind, hidden: sections.find((section) => section.kind === kind && !section.visible),
    }))
    : []
  const needsAtsMode = !atsMode && (failed('layout') || failed('reads_back'))

  /** The fix a failing check can apply by itself: it names what it will change. */
  function actions(id: string) {
    if (id === 'sections') {
      return sectionFixes.map(({ kind, hidden }) => (
        <Button key={kind} type="button" size="sm" variant="secondary" onClick={() => hidden ? onShowSection(hidden.id) : onAddSection(kind)}>
          {hidden ? 'Show' : 'Add'} {sectionLabels[kind]} section
        </Button>
      ))
    }
    // Both checks are cured by the same switch; offer it once, on the first of them that fails.
    const firstAtsCheck = failed('layout') ? 'layout' : 'reads_back'
    if ((id === 'layout' || id === 'reads_back') && needsAtsMode && id === firstAtsCheck) {
      return [(
        <Button key="ats" type="button" size="sm" variant="secondary" onClick={onTurnOnAtsMode}><ShieldCheck aria-hidden="true" /> Turn on ATS-friendly mode</Button>
      )]
    }
    if (id === 'page_breaks' && density !== 'compact') {
      return [<Button key="compact" type="button" size="sm" variant="secondary" onClick={onCompactSpacing}>Use compact spacing</Button>]
    }
    return []
  }

  return (
    <Stack gap={4} aria-busy={quality.isFetching || undefined}>
      <Section
        headingLevel={3}
        title={checklistSummary(checks)}
        description="Checked against the PDF you’d send. Pass or fail only. Not a prediction."
        actions={quality.isFetching ? <span className="cvs-hint" role="status">Updating…</span> : undefined}
      >
        <List framed={false} aria-label="Checks" className="cvs-checks">
          {checks.map((check) => {
            const fixes = check.passed ? [] : actions(check.id)
            return (
              <Row key={check.id}>
                <RowBody>
                  <RowTitle>{check.label}</RowTitle>
                  <RowSubtitle>{check.passed ? check.detail : check.fix}</RowSubtitle>
                  {check.passed ? null : (
                    <Disclosure variant="inline" title="Why?" className="cvs-check__why">
                      <p className="cvs-hint">{check.detail}</p>
                    </Disclosure>
                  )}
                  {fixes.length > 0 ? <Cluster gap={2} className="cvs-check__fixes">{fixes}</Cluster> : null}
                </RowBody>
                <RowMeta>
                  <Badge size="sm" tone={check.passed ? 'mint' : 'rose'}>{check.passed ? 'Pass' : 'Fix'}</Badge>
                </RowMeta>
              </Row>
            )
          })}
        </List>
      </Section>
      {ready ? (
        <Notice
          tone="success" title="Ready to send"
          action={(
            <Button type="button" size="sm" variant="secondary" loading={exporting} disabled={!canExport} onClick={onExportPdf}>
              <Download aria-hidden="true" /> Export PDF
            </Button>
          )}
        >
          Every check passes for the PDF you’d download.
        </Notice>
      ) : null}
    </Stack>
  )
}

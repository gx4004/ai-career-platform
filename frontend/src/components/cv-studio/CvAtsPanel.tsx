import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { ShieldCheck } from 'lucide-react'
import {
  Badge, Button, Cluster, List, Notice, Row, RowBody, RowMeta, RowSubtitle, RowTitle, Section, Skeleton, Stack,
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

export function CvAtsPanel({ quality, sections, atsMode, onTurnOnAtsMode, onAddSection, onShowSection }: {
  quality: ReturnType<typeof useCvQuality>; sections: CvSection[]; atsMode: boolean; onTurnOnAtsMode: () => void
  onAddSection: (kind: CvSection['kind']) => void; onShowSection: (sectionId: string) => void
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
        <List aria-label="Checks" aria-busy="true" className="cvs-checks-skeleton"><Skeleton variant="row" as="li" count={5} /></List>
        <p className="kit-sr-only" role="status">Checking your CV…</p>
      </Section>
    )
  }

  const { checks } = quality.data
  const sectionsFail = checks.some((check) => check.id === 'sections' && !check.passed)
  const sectionFixes = sectionsFail
    ? REQUIRED_KINDS.filter((kind) => !sections.some((section) => section.kind === kind && section.visible)).map((kind) => ({
      kind, hidden: sections.find((section) => section.kind === kind && !section.visible),
    }))
    : []
  const layoutFails = checks.some((check) => check.id === 'layout' && !check.passed)
  const hasFixes = sectionFixes.length > 0 || (layoutFails && !atsMode)
  return (
    <Stack gap={4} aria-busy={quality.isFetching || undefined}>
      <Section
        headingLevel={3}
        title={checklistSummary(checks)}
        description="Checked against the PDF you’d send. Pass or fail only. Not a prediction."
        actions={quality.isFetching ? <span className="cvs-hint" role="status">Updating…</span> : undefined}
      >
        <List aria-label="Checks">
          {checks.map((check) => (
            <Row key={check.id}>
              <RowBody>
                <RowTitle>{check.label}</RowTitle>
                <RowSubtitle>{check.passed ? check.detail : check.fix}</RowSubtitle>
              </RowBody>
              <RowMeta>
                <Badge size="sm" tone={check.passed ? 'success' : 'warning'}>{check.passed ? 'Passes' : 'To fix'}</Badge>
              </RowMeta>
            </Row>
          ))}
        </List>
      </Section>
      {hasFixes ? (
        <Cluster gap={2}>
          {sectionFixes.map(({ kind, hidden }) => (
            <Button key={kind} type="button" size="sm" variant="secondary" onClick={() => hidden ? onShowSection(hidden.id) : onAddSection(kind)}>
              {hidden ? 'Show' : 'Add'} {sectionLabels[kind]} section
            </Button>
          ))}
          {layoutFails && !atsMode ? (
            <Button type="button" size="sm" variant="secondary" onClick={onTurnOnAtsMode}><ShieldCheck aria-hidden="true" /> Turn on ATS-friendly mode</Button>
          ) : null}
        </Cluster>
      ) : null}
    </Stack>
  )
}

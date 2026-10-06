import { useEffect, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { Check, CircleAlert, ListPlus } from 'lucide-react'
import {
  Button,
  Card,
  Disclosure,
  Highlight,
  KeyValue,
  List,
  Notice,
  Row,
  RowBody,
  RowLeading,
  RowSubtitle,
  RowTitle,
  ScoreBar,
  Section,
  Stack,
} from '#/components/kit'
import { classifyApplicationGaps, getApplicationGapResponse, reviewApplication } from '#/lib/api/client'
import { createDevelopmentItem } from '#/lib/api/development'
import type { GapClassification } from '#/lib/api/gapClassificationSchemas'
import { GAP_KIND_LABELS, RESPONSE_KIND_LABELS, commercialRelationshipLabel } from '#/lib/development/plan'
import { DEVELOPMENT_PLAN_QUERY_KEY } from '#/lib/query/evidenceCaches'
import { PROVENANCE_LABELS, contentEntries } from '#/lib/profile/evidence'
import { ApplicationPanel } from './ApplicationPanel'

type Finding = Awaited<ReturnType<typeof reviewApplication>>['findings'][number]

const CHECKS: Array<{ category: Finding['category']; title: string; short: string; detail: string }> = [
  { category: 'unsupported_claim', title: 'Everything you claim is backed up', short: 'claims backed up', detail: 'Numbers, names and results also appear in your CV or profile.' },
  { category: 'missed_requirement', title: 'You cover what the job asks for', short: 'job requirements covered', detail: 'The key skills in the job posting show up in your documents.' },
  { category: 'contradiction', title: 'Your documents agree', short: 'documents agree', detail: 'Your CV and cover letter tell the same story, like years of experience.' },
  { category: 'generic_language', title: 'No stock phrases', short: 'no stock phrases', detail: 'Lines like “team player” are swapped for specifics.' },
  { category: 'repetition', title: 'Nothing is repeated', short: 'nothing repeated', detail: 'Each sentence earns its place.' },
  { category: 'document_defect', title: 'No placeholders or near-empty documents', short: 'no placeholders', detail: 'No leftover [Company] or TODO, and both documents have real content.' },
]

const hiddenKey = (applicationId: string) => `cw:hidden-findings:${applicationId}`

/** The findings the owner hid on this application. Finding ids are stable between runs, so a hide survives a reload. */
function readHidden(applicationId: string): Set<string> {
  try {
    const stored = JSON.parse(window.localStorage.getItem(hiddenKey(applicationId)) ?? '[]') as unknown
    return new Set(Array.isArray(stored) ? stored.filter((id): id is string => typeof id === 'string') : [])
  } catch {
    return new Set()
  }
}

function writeHidden(applicationId: string, ids: Set<string>) {
  try {
    window.localStorage.setItem(hiddenKey(applicationId), JSON.stringify([...ids]))
  } catch {
    // Storage blocked: the hide lasts for this visit only.
  }
}

/** Rule-based content checks on what this application would send, plus next steps for gaps. */
export function DocumentChecks({
  applicationId,
  sent = false,
  hasDocuments = true,
}: {
  applicationId: string
  /** Already applied: the checks no longer change what was sent. */
  sent?: boolean
  /** A CV version or cover letter (chosen or drafted) exists; without one every check would pass vacuously. */
  hasDocuments?: boolean
}) {
  const [hidden, setHidden] = useState<Set<string>>(() => new Set())
  // Read after mount: the server render has no storage.
  useEffect(() => setHidden(readHidden(applicationId)), [applicationId])
  const hide = (id: string) =>
    setHidden((current) => {
      const next = new Set(current).add(id)
      writeHidden(applicationId, next)
      return next
    })
  const classify = useMutation({ mutationFn: () => classifyApplicationGaps(applicationId) })
  const review = useMutation({
    mutationFn: () => reviewApplication(applicationId),
    onSuccess: () => classify.reset(),
  })
  // Results of an earlier run no longer describe anything once the documents are unpicked.
  const result = hasDocuments ? review.data : undefined
  const all = result?.findings ?? []
  // Hiding a finding only tidies the list: the tally and the marks still count what the checks found.
  const findings = all.filter((item) => !hidden.has(item.id))
  const clear = CHECKS.filter((check) => !all.some((item) => item.category === check.category)).length

  return (
    <ApplicationPanel
      title="Check your documents"
      description={
        sent
          ? 'Quick rule-based checks on the CV and cover letter chosen now. What you sent stays as it was; use what they find for your next application.'
          : 'Quick rule-based checks on the CV and cover letter this application would send. Nothing is changed for you.'
      }
      actions={
        <Button
          variant="secondary"
          size="sm"
          onClick={() => review.mutate()}
          loading={review.isPending}
          disabled={review.isPending || !hasDocuments}
        >
          {review.isPending ? 'Checking…' : result ? 'Check again' : 'Run the checks'}
        </Button>
      }
    >
      <Stack gap={3}>
        {review.isError ? (
          <Notice tone="danger">
            {review.error instanceof Error && review.error.message ? review.error.message : "The checks couldn't run. Try again."}
          </Notice>
        ) : null}
        {result ? (
          <>
            <p className="camp-note" aria-live="polite">
              {findings.length
                ? `${findings.length} thing${findings.length === 1 ? '' : 's'} to look at`
                : all.length
                  ? 'You hid everything the checks found.'
                  : 'These checks found nothing to fix.'}
            </p>
            {/* How much of the checklist is clear: a plain count of checks, not a quality score. */}
            <ScoreBar
              aria-label={`${clear} of ${CHECKS.length} checks clear`}
              value={clear}
              max={CHECKS.length}
              valueLabel={`${clear}/${CHECKS.length}`}
              tone="success"
            />
          </>
        ) : null}
        {findings.length > 0 ? (
          <Notice
            action={
              <Button variant="secondary" size="sm" disabled={classify.isPending} onClick={() => classify.mutate()}>
                <ListPlus aria-hidden="true" />
                {classify.isPending ? 'Working…' : 'Suggest next steps'}
              </Button>
            }
          >
            Turn what the checks found into steps in your development plan. Nothing is added until you choose.
          </Notice>
        ) : null}
        {classify.isError ? <Notice tone="danger">Next steps couldn't be suggested. Nothing was added.</Notice> : null}
        {!hasDocuments ? (
          <p className="camp-note" data-testid="checks-idle">
            Pick a CV version or cover letter above to check them.
          </p>
        ) : !result ? (
          <p className="camp-note" data-testid="checks-idle">
            {CHECKS.length} checks, not run yet: {CHECKS.map((check) => check.short).join(', ')}.
          </p>
        ) : (
          <List aria-label="Document checks">
            {CHECKS.map((check) => {
              const matches = findings.filter((item) => item.category === check.category)
              const state = all.some((item) => item.category === check.category) ? 'warn' : 'pass'
              return (
                <Row key={check.category} className={matches.length ? 'camp-check-row' : undefined}>
                  <RowLeading>
                    <CheckMark state={state} />
                  </RowLeading>
                  <RowBody>
                    <RowTitle>{check.title}</RowTitle>
                    <RowSubtitle>{check.detail}</RowSubtitle>
                    {matches.length ? (
                      <Stack gap={2} className="camp-findings">
                        {matches.map((item) => (
                          <Card key={item.id} padding="sm">
                            <p className="camp-prose">{item.message}</p>
                            <p className="camp-note">Where: {where(item.locations)}</p>
                            <Quotes locations={item.locations} />
                            <FindingNextStep
                              applicationId={applicationId}
                              classification={classify.data?.classifications.find((candidate) => candidate.finding_id === item.id)}
                              classificationComplete={classify.isSuccess}
                            />
                            <div>
                              <Button type="button" variant="ghost" size="sm" onClick={() => hide(item.id)}>
                                Hide
                              </Button>
                            </div>
                          </Card>
                        ))}
                      </Stack>
                    ) : null}
                  </RowBody>
                </Row>
              )
            })}
          </List>
        )}
      </Stack>
    </ApplicationPanel>
  )
}

/**
 * The exact words a finding points at, highlighted, from the location the reviewer reports
 * ("Cover letter:chars 20-45:Reduced migration time"). Nothing is shown when it has no quoted text.
 */
function Quotes({ locations }: { locations: string[] }) {
  const quotes = locations
    .map((location) => {
      const [document, , ...rest] = location.split(':')
      const text = rest.join(':').trim()
      return text ? { document, text } : null
    })
    .filter((quote): quote is { document: string; text: string } => quote !== null)
  if (quotes.length === 0) return null
  return (
    <ul className="camp-quotes" aria-label="The wording it points at">
      {quotes.map((quote, index) => (
        <li key={`${quote.document}:${index}`}>
          <span className="camp-quotes__doc">{quote.document}</span> <Highlight>{quote.text}</Highlight>
        </li>
      ))}
    </ul>
  )
}

function CheckMark({ state }: { state: 'pass' | 'warn' }) {
  return (
    <span className="camp-check" data-state={state} role="img" aria-label={state === 'pass' ? 'Done' : 'Needs a look'}>
      {state === 'pass' ? <Check aria-hidden="true" /> : <CircleAlert aria-hidden="true" />}
    </span>
  )
}

function where(locations: string[]) {
  const places = [...new Set(locations.map((location) => location.split(':')[0]))]
  return places.join(', ') || 'Your documents'
}

function FindingNextStep({
  applicationId,
  classification,
  classificationComplete,
}: {
  applicationId: string
  classification: GapClassification | undefined
  classificationComplete: boolean
}) {
  if (!classification) {
    return classificationComplete ? <p className="camp-note">No next step to suggest for this one.</p> : null
  }
  return <ClassifiedNextStep applicationId={applicationId} classification={classification} />
}

function ClassifiedNextStep({ applicationId, classification }: { applicationId: string; classification: GapClassification }) {
  const queryClient = useQueryClient()
  const response = useMutation({ mutationFn: () => getApplicationGapResponse(applicationId, classification.id) })
  const addToPlan = useMutation({
    mutationFn: () => createDevelopmentItem({ gap_classification_id: classification.id }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: DEVELOPMENT_PLAN_QUERY_KEY })
    },
  })
  const offer = response.data
  return (
    <section className="camp-step" aria-label={`Next step for ${GAP_KIND_LABELS[classification.gap_kind]}`}>
      <KeyValue layout="stacked" divided={false} items={[{ label: 'What kind of gap', value: GAP_KIND_LABELS[classification.gap_kind] }]} />
      <Disclosure variant="inline" title="Why?">
        <ul className="camp-step__trace">{classification.cited_trace.map((step) => <li key={step}>{step}</li>)}</ul>
      </Disclosure>
      {!offer ? (
        <div>
          <Button variant="secondary" size="sm" disabled={response.isPending} onClick={() => response.mutate()}>
            {response.isPending ? 'Loading…' : 'See what to do'}
          </Button>
        </div>
      ) : (
        <Stack gap={3}>
          <Section headingLevel={4} title={offer.headline} rule={false}>
            <p className="camp-prose">{offer.detail}</p>
          </Section>
          <KeyValue
            divided={false}
            labelWidth="8rem"
            items={[
              { label: 'Suggested step', value: RESPONSE_KIND_LABELS[offer.response_kind] },
              { label: 'Paid relationship', value: commercialRelationshipLabel(offer.commercial_relationship) },
            ]}
          />
          {offer.sources.length > 0 ? (
            <ul className="camp-step__sources" aria-label="Where to go next">
              {offer.sources.map((source) => (
                <li key={`${source.label}:${source.route ?? source.url ?? ''}`}>
                  {source.route ? (
                    <Link to={source.route}>{source.label}</Link>
                  ) : source.url ? (
                    <a href={source.url} target="_blank" rel="noreferrer">{source.label}</a>
                  ) : (
                    source.label
                  )}
                </li>
              ))}
            </ul>
          ) : null}
          {offer.capture_proposal ? (
            <Card as="div" padding="sm" aria-label="Suggested profile entry" role="group">
              <strong>Suggested profile entry</strong>
              <ul className="camp-step__trace">
                {contentEntries(offer.capture_proposal.content).map(({ key, value }) => (
                  <li key={key}><strong>{key}:</strong> {value}</li>
                ))}
              </ul>
              <p className="camp-note">
                Source: {PROVENANCE_LABELS[offer.capture_proposal.provenance]} · Not saved yet. Only you can add it to your profile.
              </p>
            </Card>
          ) : null}
          <div>
            <Button size="sm" variant="secondary" disabled={addToPlan.isPending || addToPlan.isSuccess} onClick={() => addToPlan.mutate()}>
              <ListPlus aria-hidden="true" />
              {addToPlan.isPending ? 'Adding…' : addToPlan.isSuccess ? 'Added to your plan' : 'Add to my development plan'}
            </Button>
          </div>
          {addToPlan.isSuccess ? <p role="status" className="camp-note">Added to your development plan.</p> : null}
          {addToPlan.isError ? <Notice tone="danger">It couldn't be added. Try again.</Notice> : null}
        </Stack>
      )}
      {response.isError ? <Notice tone="danger">The suggestion couldn't be loaded. Try again.</Notice> : null}
    </section>
  )
}

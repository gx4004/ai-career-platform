import { useEffect, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { Check, CircleAlert, CircleDashed, ListPlus } from 'lucide-react'
import {
  Button,
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
import { KIND_LABELS, PROVENANCE_LABELS, contentEntries } from '#/lib/profile/evidence'
import type { EvidenceKind } from '#/lib/api/schemas'
import { ApplicationPanel } from './ApplicationPanel'

type Finding = Awaited<ReturnType<typeof reviewApplication>>['findings'][number]

/**
 * `reads`: the content a check needs. "either" reads whichever document has text; "both" compares the two. A check
 * whose documents are near-empty has nothing to read, so it is "Not checked" (not a vacuous pass) and leaves the tally.
 */
const CHECKS: Array<{ category: Finding['category']; title: string; short: string; detail: string; reads?: 'either' | 'both' }> = [
  { category: 'unsupported_claim', title: 'Everything you claim is backed up', short: 'claims backed up', detail: 'Numbers, names and results also appear in your CV or profile.', reads: 'either' },
  { category: 'missed_requirement', title: 'You cover what the job asks for', short: 'job requirements covered', detail: 'The key skills in the job posting show up in your documents.' },
  { category: 'contradiction', title: 'Your documents agree', short: 'documents agree', detail: 'Your CV and cover letter tell the same story, like years of experience.', reads: 'both' },
  { category: 'generic_language', title: 'No stock phrases', short: 'no stock phrases', detail: 'Lines like “team player” are swapped for specifics.', reads: 'either' },
  { category: 'repetition', title: 'Nothing is repeated', short: 'nothing repeated', detail: 'Each sentence earns its place.', reads: 'either' },
  { category: 'document_defect', title: 'No placeholders or near-empty documents', short: 'no placeholders', detail: 'No leftover [Company] or TODO, and both documents have real content.' },
]

type CheckState = 'pass' | 'warn' | 'skip'
type Chosen = { cv: boolean; cover_letter: boolean }

/** The reviewer reports a near-empty CV or cover letter as a document_defect on "<document>:entire document". */
function nearEmpty(findings: Finding[], document: 'CV' | 'Cover letter') {
  return findings.some((item) => item.category === 'document_defect' && item.locations.includes(`${document}:entire document`))
}

/** A document not chosen has nothing to read, like a near-empty one; the review says which were chosen. */
function checkStates(findings: Finding[], chosen: Chosen): CheckState[] {
  const emptyCv = !chosen.cv || nearEmpty(findings, 'CV')
  const emptyCover = !chosen.cover_letter || nearEmpty(findings, 'Cover letter')
  return CHECKS.map((check) => {
    if (findings.some((item) => item.category === check.category)) return 'warn'
    if (check.reads === 'both' && (emptyCv || emptyCover)) return 'skip'
    if (check.reads === 'either' && emptyCv && emptyCover) return 'skip'
    return 'pass'
  })
}

/** Why a check was not run: the comparison misses a document nobody chose; otherwise there is no content yet. */
function skipReason(check: (typeof CHECKS)[number], chosen: Chosen) {
  if (check.reads === 'both' && chosen.cv && !chosen.cover_letter) return 'Not checked: no cover letter chosen.'
  if (check.reads === 'both' && !chosen.cv && chosen.cover_letter) return 'Not checked: no CV chosen.'
  return 'Not checked: add content first.'
}

/** The check's line, speaking only of the documents chosen. */
function checkDetail(check: (typeof CHECKS)[number], chosen: Chosen) {
  if (check.category !== 'document_defect' || (chosen.cv && chosen.cover_letter)) return check.detail
  if (chosen.cv) return 'No leftover [Company] or TODO, and your CV has real content.'
  if (chosen.cover_letter) return 'No leftover [Company] or TODO, and your cover letter has real content.'
  return check.detail
}

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
  // A result from before the review named its documents counts both as chosen.
  const chosen: Chosen = result?.documents ?? { cv: true, cover_letter: true }
  const states = checkStates(all, chosen)
  const clear = states.filter((state) => state === 'pass').length
  const counted = states.filter((state) => state !== 'skip').length

  // Sent with nothing attached: the pickers above are locked, so there is nothing to pick and nothing to run.
  const nothingSent = sent && !hasDocuments

  return (
    <ApplicationPanel
      title="Check your documents"
      description={
        nothingSent
          ? undefined
          : sent
            ? 'Quick rule-based checks on the CV and cover letter chosen now. What you sent stays as it was; use what they find for your next application.'
            : 'Quick rule-based checks on the CV and cover letter this application would send. Nothing is changed for you.'
      }
      actions={
        nothingSent ? undefined : (
          <Button
            variant="secondary"
            size="sm"
            onClick={() => review.mutate()}
            loading={review.isPending}
            disabled={review.isPending || !hasDocuments}
          >
            {review.isPending ? 'Checking…' : result ? 'Check again' : 'Run the checks'}
          </Button>
        )
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
              aria-label={`${clear} of ${counted} checks clear`}
              value={clear}
              max={counted}
              valueLabel={`${clear}/${counted}`}
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
        {nothingSent ? (
          // Said without "when you marked it applied": what was sent may have been recorded later, on a card that
          // had already moved on ("Record what I sent").
          <p className="camp-note" data-testid="checks-idle">
            No CV or cover letter was in what you sent, so there is nothing to check.
          </p>
        ) : !hasDocuments ? (
          <p className="camp-note" data-testid="checks-idle">
            Pick a CV version or cover letter above to check them.
          </p>
        ) : !result ? (
          <p className="camp-note" data-testid="checks-idle">
            {CHECKS.length} checks, not run yet: {CHECKS.map((check) => check.short).join(', ')}.
          </p>
        ) : (
          <List aria-label="Document checks">
            {CHECKS.map((check, index) => {
              const matches = findings.filter((item) => item.category === check.category)
              const state = states[index]
              return (
                <Row key={check.category} className={matches.length ? 'camp-check-row' : undefined}>
                  <RowLeading>
                    <CheckMark state={state} />
                  </RowLeading>
                  <RowBody>
                    <RowTitle>{check.title}</RowTitle>
                    <RowSubtitle>{state === 'skip' ? skipReason(check, chosen) : checkDetail(check, chosen)}</RowSubtitle>
                    {matches.length ? (
                      // Flat rows under the check (2px --line rules), not Cards: a Card is a sticker for a real object.
                      <List aria-label={`${check.title}: findings`} framed={false} flush className="camp-findings">
                        {matches.map((item) => (
                          <Row key={item.id} className="camp-finding">
                            <RowBody>
                              <Stack gap={2}>
                                <p className="camp-prose">{item.message}</p>
                                <p className="camp-note">Where: {where(item.locations)}</p>
                                <Quotes locations={item.locations} />
                                <FindingNextStep
                                  applicationId={applicationId}
                                  classification={classify.data?.classifications.find((candidate) => candidate.finding_id === item.id)}
                                  classificationComplete={classify.isSuccess}
                                />
                                <div>
                                  <Button type="button" variant="ghost" size="sm" flush="start" onClick={() => hide(item.id)}>
                                    Hide this finding
                                  </Button>
                                </div>
                              </Stack>
                            </RowBody>
                          </Row>
                        ))}
                      </List>
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

const CHECK_MARKS: Record<CheckState, { label: string; Icon: typeof Check }> = {
  pass: { label: 'Done', Icon: Check },
  warn: { label: 'Needs a look', Icon: CircleAlert },
  skip: { label: 'Not checked', Icon: CircleDashed },
}

function CheckMark({ state }: { state: CheckState }) {
  const { label, Icon } = CHECK_MARKS[state]
  return (
    <span className="camp-check" data-state={state} role="img" aria-label={label}>
      <Icon aria-hidden="true" />
    </span>
  )
}

function where(locations: string[]) {
  const places = [...new Set(locations.map((location) => location.split(':')[0]))]
  return places.join(', ') || 'Your documents'
}

/**
 * The classifier's cited trace ("listing_requirement:Kubernetes", "profile_lookup:Kubernetes:absent",
 * "classified:missing_skill") as the plain sentences the owner reads under "Why?". A step with no wording here (a
 * per-source lookup the result line already sums up, or a step a newer backend adds) is left out, never printed raw.
 */
const CLASSIFIED_SENTENCES: Record<string, string> = {
  missing_skill: 'So it counts as a missing skill.',
  evidence_not_yet_produced: 'So it counts as a skill you still need to show.',
  uncaptured_evidence: "So the proof exists; it just isn't in this application.",
  'uncaptured_evidence:claim_present_unconfirmed': "So it counts as evidence you have but haven't added to your profile yet.",
  presentation_weakness: "So it's about how it reads, not what you can do.",
}

const RESULT_SENTENCES: Record<string, string> = {
  // Neutral: an application may have only a CV (or only a cover letter) chosen (applications-discovery-F37).
  not_found_in_selected_materials: "The documents you chose don't mention it.",
  unsupported: "Your CV and profile don't back it up.",
  conflict: "They don't match.",
}

const DEMONSTRATED_IN = ':demonstrated_in:'

function traceSentence(step: string): string | null {
  const colon = step.indexOf(':')
  if (colon < 0) return null
  const kind = step.slice(0, colon)
  const rest = step.slice(colon + 1)
  if (!rest) return null
  switch (kind) {
    case 'listing_requirement':
      return `The job asks for ${rest}.`
    case 'claim':
      return `Your documents say “${rest}”.`
    case 'result':
      return RESULT_SENTENCES[rest] ?? null
    case 'comparison':
      return rest === 'years_of_experience' ? 'Your CV and cover letter both give years of experience.' : null
    case 'matched_phrase':
      return `“${rest}” is a stock phrase.`
    case 'repeated_text':
      return 'The same sentence appears more than once.'
    case 'placeholder':
      return `“${rest}” is a leftover placeholder.`
    case 'classified':
      return CLASSIFIED_SENTENCES[rest] ?? null
    case 'profile_lookup': {
      if (rest.endsWith(':absent')) return `Your profile has no entry for ${rest.slice(0, -':absent'.length)} either.`
      if (rest.endsWith(':skill_claimed_undemonstrated')) {
        const skill = rest.slice(0, -':skill_claimed_undemonstrated'.length)
        return `Your profile lists ${skill} as a skill, but nothing in it shows you using it yet.`
      }
      const at = rest.lastIndexOf(DEMONSTRATED_IN)
      if (at > 0) {
        const section = KIND_LABELS[rest.slice(at + DEMONSTRATED_IN.length) as EvidenceKind]
        const skill = rest.slice(0, at)
        return section ? `Your profile already shows ${skill} under ${section}.` : `Your profile already shows ${skill}.`
      }
      return null
    }
    default:
      return null
  }
}

function traceSentences(trace: string[]): string[] {
  return trace.map(traceSentence).filter((sentence): sentence is string => sentence !== null)
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
  const why = traceSentences(classification.cited_trace)
  return (
    <section className="camp-step" aria-label={`Next step for ${GAP_KIND_LABELS[classification.gap_kind]}`}>
      <KeyValue layout="stacked" divided={false} items={[{ label: 'What kind of gap', value: GAP_KIND_LABELS[classification.gap_kind] }]} />
      {why.length > 0 ? (
        <Disclosure variant="inline" title="Why?">
          <ul className="camp-step__trace" aria-label="Why it counts as this kind of gap">
            {why.map((sentence, index) => (
              <li key={`${index}:${sentence}`}>{sentence}</li>
            ))}
          </ul>
        </Disclosure>
      ) : null}
      {!offer ? (
        <div>
          <Button variant="secondary" size="sm" disabled={response.isPending} onClick={() => response.mutate()}>
            {response.isPending ? 'Loading…' : 'See what to do'}
          </Button>
        </div>
      ) : (
        <Stack gap={3}>
          {/* xs: a row-title sub-heading (UI 15/700), a step below the check title it sits under; display 24 made it
              outrank the panel's own heading. */}
          <Section headingLevel={4} size="xs" title={offer.headline} rule={false}>
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
                  {/* Kit link buttons: plain indented text gave no hint that a source opens anything. */}
                  {source.route ? (
                    <Button asChild variant="link" size="sm">
                      <Link to={source.route}>{source.label}</Link>
                    </Button>
                  ) : source.url ? (
                    <Button asChild variant="link" size="sm">
                      <a href={source.url} target="_blank" rel="noreferrer">{source.label}</a>
                    </Button>
                  ) : (
                    source.label
                  )}
                </li>
              ))}
            </ul>
          ) : null}
          {offer.capture_proposal ? (
            <div className="camp-proposal" aria-label="Suggested profile entry" role="group">
              <strong>Suggested profile entry</strong>
              <ul className="camp-step__trace">
                {contentEntries(offer.capture_proposal.content).map(({ key, value }) => (
                  <li key={key}><strong>{key}:</strong> {value}</li>
                ))}
              </ul>
              <p className="camp-note">
                Source: {PROVENANCE_LABELS[offer.capture_proposal.provenance]} · Not saved yet. Only you can add it to your profile.
              </p>
            </div>
          ) : null}
          <div>
            <Button size="sm" variant="secondary" disabled={addToPlan.isPending || addToPlan.isSuccess} onClick={() => addToPlan.mutate()}>
              <ListPlus aria-hidden="true" />
              {/* Short enough for one line in a 320px finding column; the status line below names the development plan. */}
              {addToPlan.isPending ? 'Adding…' : addToPlan.isSuccess ? 'Added to your plan' : 'Add to my plan'}
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

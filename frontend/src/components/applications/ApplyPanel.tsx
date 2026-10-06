import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowUpRight, Check, CircleCheck, RefreshCw, Sparkles, Wand2, X } from 'lucide-react'
import { Link } from '@tanstack/react-router'
import { Badge, Button, Cluster, Disclosure, Field, KeyValue, Lead, MetaRow, Notice, ScoreSeal, Stack, Textarea } from '#/components/kit'
import {
  autofillApplication,
  cancelAutofill,
  createApplicationTask,
  getApplicationDetails,
  getAutofillStatus,
  markApplicationApplied,
  prepareApplication,
  saveApplicationAnswers,
  updateApplication,
} from '#/lib/api/client'
import type { ApplicationDetail, ApplicationDetails, AutofillRunStatus } from '#/lib/api/schemas'
import { isAutopilotExperimentEnabled } from '#/lib/flags/featureFlags'
import { APPLICATION_DETAILS_QUERY_KEY, applicationQueryKey, invalidateApplications } from '#/lib/query/applicationCaches'
import { ApplicationPanel } from './ApplicationPanel'
import { applyLink, formatDate, roleOnly, applicationTitle } from './stages'

function errorMessage(error: unknown, fallback: string) {
  // The server's 409 details are written for the owner ("Answer the open questions…").
  return error instanceof Error && error.message ? error.message : fallback
}

/**
 * The one place an application moves forward: prepare the drafts, answer what
 * only the owner can answer, open the employer's form, then mark it applied.
 * Submitting always happens on the employer's site, by the owner.
 */
export function ApplyPanel({ application }: { application: ApplicationDetail }) {
  const queryClient = useQueryClient()
  const onDetail = (detail: ApplicationDetail) => {
    queryClient.setQueryData(applicationQueryKey(application.id), detail)
    void invalidateApplications(queryClient)
  }
  const prepare = useMutation({
    mutationFn: () => prepareApplication(application.id),
    onSuccess: onDetail,
    // A 409 here is "already being prepared" (another tab, a double click): its drafts arrive with the next read.
    onError: () => { void invalidateApplications(queryClient) },
  })
  const answers = useMutation({
    mutationFn: (map: Record<string, string>) => saveApplicationAnswers(application.id, map),
    onSuccess: onDetail,
  })
  const applied = useMutation({ mutationFn: () => markApplicationApplied(application.id), onSuccess: onDetail })
  const noReply = useMutation({
    mutationFn: () => updateApplication(application.id, { status: 'no_reply' }),
    onSuccess: onDetail,
  })
  const failed = [prepare, answers, applied, noReply].find((mutation) => mutation.isError)

  const link = applyLink(application.listing)
  const unanswered = application.open_questions.filter((question) => !question.answered)
  const prepared = application.drafts !== null

  if (application.applied_at) {
    return (
      <ApplicationPanel title={`You applied on ${formatDate(application.applied_at)}`} tone="mint" className="camp-applied">
        <div className="camp-applied__layout">
          {/* The big moment of the loop: the seal stamps in once, right after "Mark as applied", never on a revisit. */}
          <ScoreSeal
            className="camp-applied__seal"
            value="✓"
            unit="Applied"
            size="sm"
            tone="lilac"
            label="Application status"
            reveal={applied.isSuccess ? 'stamp' : 'none'}
          />
          <Stack gap={3}>
            <Lead>What you sent is saved below, exactly as it was when you marked it applied.</Lead>
            {application.snapshot ? <SentSummary content={application.snapshot.content} /> : null}
            {application.no_reply_suggested ? (
              <Notice
                action={
                  <Button size="sm" variant="secondary" loading={noReply.isPending} disabled={noReply.isPending} onClick={() => noReply.mutate()}>
                    Mark no reply
                  </Button>
                }
              >
                No reply yet?
              </Notice>
            ) : null}
            {failed ? <Notice tone="danger">{errorMessage(failed.error, "That didn't save. Try again.")}</Notice> : null}
            <NextSteps application={application} />
            {application.snapshot ? <SentApplication content={application.snapshot.content} /> : null}
          </Stack>
        </div>
      </ApplicationPanel>
    )
  }

  const title = !prepared
    ? 'Get this application ready'
    : unanswered.length
      ? unanswered.length === 1 ? 'One question only you can answer' : `${unanswered.length} questions only you can answer`
      : 'Ready to apply'
  const description = !prepared
    ? 'We draft a cover letter and answers to likely screening questions from your CV. Nothing is sent.'
    : unanswered.length
      ? "We don't guess things like salary or visa status. Answer these before you apply."
      : "Open the employer's form, paste in what you need, and submit it there yourself. Then mark it applied here."

  // One primary action: prepare, then answer, then apply on the employer's site.
  const primary = !prepared ? 'prepare' : unanswered.length ? 'answer' : link ? 'apply' : 'applied'

  // Lemon while it waits on the owner's answers, mint once it is ready: colour by meaning.
  const tone = prepared ? (unanswered.length ? 'lemon' : 'mint') : undefined
  return (
    <ApplicationPanel title={title} tone={tone}>
      <Stack gap={4}>
        <Lead>{description}</Lead>
        {application.open_questions.length ? (
          <QuestionsForm
            key={`${application.drafts?.run_id ?? ''}:${JSON.stringify(application.answers)}`}
            application={application}
            primary={primary === 'answer'}
            saving={answers.isPending}
            onSave={(map) => answers.mutate(map)}
          />
        ) : null}

        <Stack gap={2}>
          <Cluster gap={2} className="camp-apply__actions">
            {primary === 'prepare' ? (
              <Button onClick={() => prepare.mutate()} loading={prepare.isPending} disabled={prepare.isPending}>
                <Sparkles aria-hidden="true" /> {prepare.isPending ? 'Preparing…' : 'Prepare application'}
              </Button>
            ) : null}
            {link ? (
              <Button variant={primary === 'apply' ? 'primary' : 'secondary'} asChild>
                <a href={link} target="_blank" rel="noopener noreferrer">
                  Apply on company site <ArrowUpRight aria-hidden="true" />
                </a>
              </Button>
            ) : null}
            <Button
              variant={primary === 'applied' ? 'primary' : 'secondary'}
              onClick={() => applied.mutate()}
              loading={applied.isPending}
              disabled={applied.isPending || unanswered.length > 0}
              title={unanswered.length ? 'Answer the open questions first' : undefined}
              aria-describedby={unanswered.length ? 'camp-applied-hint' : undefined}
            >
              <Check aria-hidden="true" /> Mark as applied
            </Button>
            {prepared ? (
              <Button variant="ghost" onClick={() => prepare.mutate()} loading={prepare.isPending} disabled={prepare.isPending}>
                <RefreshCw aria-hidden="true" /> {prepare.isPending ? 'Preparing…' : 'Prepare again'}
              </Button>
            ) : null}
          </Cluster>
          {unanswered.length > 0 ? <p id="camp-applied-hint" className="camp-note">Answer the questions above first.</p> : null}
          {!link ? <p className="camp-note">No link to the employer's form was saved with this job. Apply wherever you found it.</p> : null}
        </Stack>

        {failed ? <Notice tone="danger">{errorMessage(failed.error, 'That didn’t go through. Try again.')}</Notice> : null}

        {isAutopilotExperimentEnabled() && application.autofill_supported ? (
          <AutofillBlock applicationId={application.id} blocked={unanswered.length > 0} />
        ) : null}
      </Stack>
    </ApplicationPanel>
  )
}

/**
 * The standing answer (Account, "Your standing answers") that fits a mandatory-stop question, or null.
 * Matched on the server's category, never on guesses about the wording beyond visa vs authorization.
 */
function standingAnswer(question: { question: string; category: string }, details: ApplicationDetails | undefined): string | null {
  if (!details) return null
  const pick = (value: string | undefined) => (value && value.trim() ? value.trim() : null)
  if (question.category === 'salary') return pick(details.salary_expectation)
  if (question.category === 'relocation') return pick(details.relocation)
  if (question.category === 'work_authorization') {
    return /visa|sponsor/i.test(question.question)
      ? pick(details.visa_sponsorship) ?? pick(details.work_authorization)
      : pick(details.work_authorization)
  }
  return null
}

function QuestionsForm({
  application,
  primary,
  saving,
  onSave,
}: {
  application: ApplicationDetail
  primary: boolean
  saving: boolean
  onSave: (answers: Record<string, string>) => void
}) {
  const [draft, setDraft] = useState<Record<string, string>>(() => ({ ...application.answers }))
  // Typed once on Account; offered here as an editable suggestion, never filled in without a click.
  const standing = useQuery({ queryKey: APPLICATION_DETAILS_QUERY_KEY, queryFn: getApplicationDetails, retry: false })
  const changed = application.open_questions.some(
    (question) => (draft[question.key] ?? '').trim() !== (application.answers[question.key] ?? ''),
  )
  const fullMap = (values: Record<string, string>) =>
    Object.fromEntries(application.open_questions.map((question) => [question.key, (values[question.key] ?? '').trim()]))
  return (
    <form
      className="camp-questions"
      aria-label="Questions only you can answer"
      onSubmit={(event) => {
        event.preventDefault()
        // The full map: a blank answer removes it on the server.
        onSave(fullMap(draft))
      }}
    >
      {application.open_questions.map((question) => {
        const suggestion = (draft[question.key] ?? '').trim() ? null : standingAnswer(question, standing.data)
        return (
          <Field
            key={question.key}
            id={`answer-${question.key}`}
            label={
              <>
                {question.question}
                {question.answered ? <CircleCheck className="camp-answered" aria-hidden="true" /> : null}
              </>
            }
          >
            <Textarea
              autosize
              rows={2}
              maxRows={10}
              maxLength={5000}
              value={draft[question.key] ?? ''}
              onChange={(event) => setDraft((current) => ({ ...current, [question.key]: event.target.value }))}
            />
            {suggestion ? (
              <div className="camp-suggest">
                <p className="camp-note">
                  <Badge size="sm" tone="white">From your details</Badge> {suggestion}
                </p>
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  disabled={saving}
                  aria-label={`Use your standing answer for: ${question.question}`}
                  onClick={() => {
                    const next = { ...draft, [question.key]: suggestion }
                    setDraft(next)
                    onSave(fullMap(next))
                  }}
                >
                  Use this answer
                </Button>
              </div>
            ) : null}
          </Field>
        )
      })}
      <div>
        <Button type="submit" variant={primary ? 'primary' : 'secondary'} size="sm" disabled={saving || !changed}>
          {saving ? 'Saving…' : 'Save answers'}
        </Button>
      </div>
    </form>
  )
}

// Autopilot experiment (#325): local-only, off by default, stops before submit.
// The fill runs in the background; this polls its status and can cancel it.
function AutofillBlock({ applicationId, blocked }: { applicationId: string; blocked: boolean }) {
  const queryClient = useQueryClient()
  const key = ['autofill', applicationId]
  const status = useQuery({
    queryKey: key,
    queryFn: () => getAutofillStatus(applicationId),
    refetchInterval: (query) => (['running', 'review'].includes(query.state.data?.state ?? '') ? 2000 : false),
  })
  const store = (next: AutofillRunStatus) => queryClient.setQueryData(key, next)
  const start = useMutation({ mutationFn: () => autofillApplication(applicationId), onSuccess: store })
  const cancel = useMutation({ mutationFn: () => cancelAutofill(applicationId), onSuccess: store })

  const run = status.data
  const state = run?.state ?? 'idle'
  const active = state === 'running' || state === 'review'
  const report = run?.report
  const error = start.error ?? cancel.error
  return (
    <Stack gap={3} className="camp-autofill">
      <Cluster gap={3} align="start">
        {active ? (
          <Button variant="secondary" size="sm" onClick={() => cancel.mutate()} loading={cancel.isPending} disabled={cancel.isPending}>
            <X aria-hidden="true" /> {state === 'running' ? 'Cancel' : 'Close the window'}
          </Button>
        ) : (
          <Button variant="secondary" size="sm" onClick={() => start.mutate()} loading={start.isPending} disabled={blocked || start.isPending}>
            <Wand2 aria-hidden="true" /> Fill the form for me
          </Button>
        )}
        <p className="camp-note camp-autofill__text">
          <Badge tone="warning" size="sm">Experimental</Badge>{' '}
          {state === 'running'
            ? 'Opening the employer’s form on this computer and filling it. Nothing is submitted.'
            : state === 'review'
              ? `The form is open in a browser window. Check it and press submit yourself. The window closes itself in ${Math.max(1, Math.ceil((run?.seconds_left ?? 0) / 60))} min.`
              : 'Opens the employer’s form in a browser on this computer and fills what it can. You check it and press submit yourself.'}
        </p>
      </Cluster>
      {error ? <Notice tone="danger">{errorMessage(error, 'Could not fill the form.')}</Notice> : null}
      {state === 'failed' ? <Notice tone="danger">{run?.message} {run?.next_step}</Notice> : null}
      {state === 'closed' && run?.message ? <p className="camp-note" role="status">{run.message}</p> : null}
      {report ? (
        <Notice>
          <p><strong>Filled:</strong> {report.filled.length ? report.filled.join(', ') : 'nothing'}</p>
          {report.skipped.length ? <p><strong>Fill these yourself (highlighted in the form):</strong> {report.skipped.join(', ')}</p> : null}
          {report.mismatched.length ? <p><strong>Check these (the form changed what was typed):</strong> {report.mismatched.join(', ')}</p> : null}
          <p>Nothing was submitted. Check the browser window and press submit when you're happy.</p>
        </Notice>
      ) : null}
    </Stack>
  )
}

/** What was frozen when it was marked applied, at a glance: the job, the CV, the letter and how many answers. */
function SentSummary({ content }: { content: Record<string, unknown> }) {
  const listing = content.listing as { title?: string; company?: string } | null
  const cv = content.cv_variant as { name?: string } | null
  const cover = content.cover_letter as { source?: string } | null
  const answers = (content.answers as unknown[] | undefined) ?? []
  const facts = [
    listing?.title ? `Job: ${[listing.title, listing.company].filter(Boolean).join(', ')}` : null,
    `CV: ${cv?.name || 'none chosen'}`,
    `Cover letter: ${cover ? (cover.source === 'prepared' ? 'prepared draft' : 'your own') : 'none'}`,
    answers.length ? `${answers.length} ${answers.length === 1 ? 'answer' : 'answers'}` : null,
  ].filter((fact): fact is string => fact !== null)
  return (
    <MetaRow aria-label="What was sent">
      {facts.map((fact) => (
        <span key={fact}>{fact}</span>
      ))}
    </MetaRow>
  )
}

const WEEK_MS = 7 * 86_400_000

/** After applying: the two moves that matter next, a follow-up in a week and interview prep. */
function NextSteps({ application }: { application: ApplicationDetail }) {
  const queryClient = useQueryClient()
  const waiting = application.status === 'applied' || application.status === 'no_reply'
  const role = roleOnly(applicationTitle(application), application.company)
  const followUp = application.tasks.find((task) => /follow.?up/i.test(task.title) && !task.completed)
  const dueDate = new Date(Date.now() + WEEK_MS)
  dueDate.setHours(12, 0, 0, 0)
  const add = useMutation({
    mutationFn: () => createApplicationTask(application.id, { title: `Follow up on ${role}`, deadline: dueDate.toISOString() }),
    onSuccess: () => invalidateApplications(queryClient),
  })
  if (!waiting) return null
  const interview = application.selected_materials.interview
  return (
    <Stack gap={2}>
      <p className="camp-note"><strong>What next</strong></p>
      <Cluster gap={2}>
        {followUp ? (
          <p className="camp-note">
            Follow-up task added{followUp.deadline ? ` for ${formatDate(followUp.deadline)}` : ''}.
          </p>
        ) : (
          <Button type="button" size="sm" variant="secondary" loading={add.isPending} onClick={() => add.mutate()}>
            Follow up in a week ({formatDate(dueDate.toISOString())})
          </Button>
        )}
        {interview ? (
          <Button asChild size="sm" variant="secondary">
            <Link to="/interview/result/$historyId" params={{ historyId: interview.id }}>Open your interview prep</Link>
          </Button>
        ) : (
          <Button asChild size="sm" variant="secondary">
            <Link to="/interview">Prepare for interviews</Link>
          </Button>
        )}
      </Cluster>
      {add.isError ? <Notice tone="danger">The follow-up couldn't be added. Try again.</Notice> : null}
    </Stack>
  )
}

/** What was sent, frozen when the application was marked applied. */
function SentApplication({ content }: { content: Record<string, unknown> }) {
  const listing = content.listing as { title?: string; company?: string } | null
  const cv = content.cv_variant as { name?: string } | null
  const cover = content.cover_letter as { source?: string } | null
  const answers = (content.answers as Array<{ question: string; answer: string }> | undefined) ?? []
  return (
    <Disclosure variant="inline" title="See what you sent">
      <KeyValue
        layout="stacked"
        items={[
          { label: 'Job', value: listing ? [listing.title, listing.company].filter(Boolean).join(' · ') : 'No job posting attached' },
          { label: 'CV', value: cv?.name || 'No CV chosen' },
          { label: 'Cover letter', value: cover ? (cover.source === 'prepared' ? 'The prepared draft' : 'Your chosen cover letter') : 'None' },
          ...answers.map((item) => ({ key: item.question, label: item.question, value: item.answer })),
        ]}
      />
    </Disclosure>
  )
}

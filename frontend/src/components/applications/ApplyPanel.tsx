import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowUpRight, Check, CircleCheck, RefreshCw, Sparkles, Wand2, X } from 'lucide-react'
import { Badge, Button, Cluster, Disclosure, Field, KeyValue, Lead, Notice, Section, Stack, Textarea } from '#/components/kit'
import {
  autofillApplication,
  cancelAutofill,
  getAutofillStatus,
  markApplicationApplied,
  prepareApplication,
  saveApplicationAnswers,
  updateApplication,
} from '#/lib/api/client'
import type { ApplicationDetail, AutofillRunStatus } from '#/lib/api/schemas'
import { isAutopilotExperimentEnabled } from '#/lib/flags/featureFlags'
import { applicationQueryKey, invalidateApplications } from '#/lib/query/applicationCaches'
import { applyLink, formatDate } from './stages'

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
  const prepare = useMutation({ mutationFn: () => prepareApplication(application.id), onSuccess: onDetail })
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
      <Section title={`You applied on ${formatDate(application.applied_at)}`}>
        <Stack gap={3}>
          <Lead>What you sent is saved below, exactly as it was when you marked it applied.</Lead>
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
          {application.snapshot ? <SentApplication content={application.snapshot.content} /> : null}
        </Stack>
      </Section>
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

  return (
    <Section title={title}>
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
    </Section>
  )
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
  const changed = application.open_questions.some(
    (question) => (draft[question.key] ?? '').trim() !== (application.answers[question.key] ?? ''),
  )
  return (
    <form
      className="camp-questions"
      aria-label="Questions only you can answer"
      onSubmit={(event) => {
        event.preventDefault()
        // The full map: a blank answer removes it on the server.
        onSave(Object.fromEntries(application.open_questions.map((question) => [question.key, (draft[question.key] ?? '').trim()])))
      }}
    >
      {application.open_questions.map((question) => (
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
        </Field>
      ))}
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

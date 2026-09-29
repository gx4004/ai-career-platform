import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowUpRight, Check, CircleCheck, RefreshCw, Sparkles, Wand2, X } from 'lucide-react'
import { WorkspacePanel } from '#/components/app/WorkspacePage'
import { Button } from '#/components/ui/button'
import {
  autofillApplication,
  cancelAutofill,
  getAutofillStatus,
  markApplicationApplied,
  prepareApplication,
  saveApplicationAnswers,
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
  const failed = [prepare, answers, applied].find((mutation) => mutation.isError)

  const link = applyLink(application.listing)
  const unanswered = application.open_questions.filter((question) => !question.answered)
  const prepared = application.drafts !== null

  if (application.applied_at) {
    return (
      <WorkspacePanel kicker="Apply" title={`You applied on ${formatDate(application.applied_at)}`} description="What you sent is saved below, exactly as it was when you marked it applied." className="camp-apply is-applied">
        {application.snapshot ? <SentApplication content={application.snapshot.content} /> : null}
        {link ? (
          <div className="camp-apply__actions">
            <Button variant="outline" asChild>
              <a href={link} target="_blank" rel="noopener noreferrer">Open the job posting <ArrowUpRight size={14} aria-hidden="true" /></a>
            </Button>
          </div>
        ) : null}
      </WorkspacePanel>
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
    <WorkspacePanel kicker="Apply" title={title} description={description} className="camp-apply">
      {application.open_questions.length ? (
        <QuestionsForm
          key={`${application.drafts?.run_id ?? ''}:${JSON.stringify(application.answers)}`}
          application={application}
          primary={primary === 'answer'}
          saving={answers.isPending}
          onSave={(map) => answers.mutate(map)}
        />
      ) : null}

      <div className="camp-apply__actions">
        {primary === 'prepare' ? (
          <Button onClick={() => prepare.mutate()} loading={prepare.isPending} disabled={prepare.isPending}>
            <Sparkles size={15} aria-hidden="true" /> {prepare.isPending ? 'Preparing…' : 'Prepare application'}
          </Button>
        ) : null}
        {link ? (
          <Button variant={primary === 'apply' ? 'default' : 'outline'} asChild>
            <a href={link} target="_blank" rel="noopener noreferrer">
              Apply on company site <ArrowUpRight size={14} aria-hidden="true" />
            </a>
          </Button>
        ) : null}
        <Button
          variant={primary === 'applied' ? 'default' : 'outline'}
          onClick={() => applied.mutate()}
          loading={applied.isPending}
          disabled={applied.isPending || unanswered.length > 0}
          title={unanswered.length ? 'Answer the open questions first' : undefined}
        >
          <Check size={15} aria-hidden="true" /> Mark as applied
        </Button>
        {prepared ? (
          <Button variant="ghost" onClick={() => prepare.mutate()} loading={prepare.isPending} disabled={prepare.isPending}>
            <RefreshCw size={14} aria-hidden="true" /> {prepare.isPending ? 'Preparing…' : 'Prepare again'}
          </Button>
        ) : null}
      </div>
      {!link ? <p className="camp-muted">No link to the employer's form was saved with this job. Apply wherever you found it.</p> : null}

      {failed ? (
        <p className="camp-alert" role="alert">{errorMessage(failed.error, 'That didn’t go through. Try again.')}</p>
      ) : null}

      {isAutopilotExperimentEnabled() && link ? (
        <AutofillBlock applicationId={application.id} blocked={unanswered.length > 0} />
      ) : null}
    </WorkspacePanel>
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
      <ol>
        {application.open_questions.map((question) => (
          <li key={question.key} className={question.answered ? 'is-answered' : undefined}>
            <label htmlFor={`answer-${question.key}`}>
              {question.answered ? <CircleCheck size={15} aria-hidden="true" /> : null}
              {question.question}
            </label>
            <textarea
              id={`answer-${question.key}`}
              className="workspace-textarea"
              rows={2}
              maxLength={5000}
              value={draft[question.key] ?? ''}
              onChange={(event) => setDraft((current) => ({ ...current, [question.key]: event.target.value }))}
            />
          </li>
        ))}
      </ol>
      <Button type="submit" variant={primary ? 'default' : 'outline'} size="sm" disabled={saving || !changed}>
        {saving ? 'Saving…' : 'Save answers'}
      </Button>
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
    <div className="camp-autofill">
      <div className="camp-autofill__row">
        {active ? (
          <Button variant="outline" size="sm" onClick={() => cancel.mutate()} loading={cancel.isPending} disabled={cancel.isPending}>
            <X size={14} aria-hidden="true" /> {state === 'running' ? 'Cancel' : 'Close the window'}
          </Button>
        ) : (
          <Button variant="outline" size="sm" onClick={() => start.mutate()} loading={start.isPending} disabled={blocked || start.isPending}>
            <Wand2 size={14} aria-hidden="true" /> Fill the form for me (experimental)
          </Button>
        )}
        <p className="camp-muted">
          {state === 'running'
            ? 'Opening the employer’s form on this computer and filling it. Nothing is submitted.'
            : state === 'review'
              ? `The form is open in a browser window. Check it and press submit yourself. The window closes itself in ${Math.max(1, Math.ceil((run?.seconds_left ?? 0) / 60))} min.`
              : 'Opens the employer’s form in a browser on this computer and fills what it can. You check it and press submit yourself.'}
        </p>
      </div>
      {error ? <p className="camp-alert" role="alert">{errorMessage(error, 'Could not fill the form.')}</p> : null}
      {state === 'failed' ? (
        <p className="camp-alert" role="alert">{run?.message} {run?.next_step}</p>
      ) : null}
      {state === 'closed' && run?.message ? <p className="camp-muted" role="status">{run.message}</p> : null}
      {report ? (
        <div className="camp-autofill__report" role="status">
          <p><strong>Filled:</strong> {report.filled.length ? report.filled.join(', ') : 'nothing'}</p>
          {report.skipped.length ? <p><strong>Fill these yourself (highlighted in the form):</strong> {report.skipped.join(', ')}</p> : null}
          {report.mismatched.length ? <p><strong>Check these (the form changed what was typed):</strong> {report.mismatched.join(', ')}</p> : null}
          <p>Nothing was submitted. Check the browser window and press submit when you're happy.</p>
        </div>
      ) : null}
    </div>
  )
}

/** What was sent, frozen when the application was marked applied. */
function SentApplication({ content }: { content: Record<string, unknown> }) {
  const listing = content.listing as { title?: string; company?: string } | null
  const cv = content.cv_variant as { name?: string } | null
  const cover = content.cover_letter as { source?: string } | null
  const answers = (content.answers as Array<{ question: string; answer: string }> | undefined) ?? []
  return (
    <details className="camp-sent">
      <summary>See what you sent</summary>
      <dl>
        <div><dt>Job</dt><dd>{listing ? [listing.title, listing.company].filter(Boolean).join(' · ') : 'No job posting attached'}</dd></div>
        <div><dt>CV</dt><dd>{cv?.name || 'No CV chosen'}</dd></div>
        <div><dt>Cover letter</dt><dd>{cover ? (cover.source === 'prepared' ? 'The prepared draft' : 'Your chosen cover letter') : 'None'}</dd></div>
        {answers.map((item) => (
          <div key={item.question}><dt>{item.question}</dt><dd>{item.answer}</dd></div>
        ))}
      </dl>
    </details>
  )
}

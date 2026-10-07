import { useEffect, useState } from 'react'
import { Button, Field, Textarea } from '#/components/kit'
import { JobImportCard } from '#/components/tooling/JobImportCard'
import { ResumeSource } from '#/components/tooling/ResumeSource'
import {
  ToolForm,
  ToolPageLoading,
  ToolPageShell,
  getSeededFieldNote,
  useToolPageState,
} from '#/components/tooling/toolPageShared'
import { writeWorkflowContext } from '#/lib/tools/drafts'

export function ResumeToolPage() {
  const { tool, config, draft, setField, mutation, bridge, errors, handleSubmit } =
    useToolPageState('resume')

  const resumeField = config.fields.find((field) => field.name === 'resumeText')!
  const jobField = config.fields.find((field) => field.name === 'jobDescription')
  const [showOptionalJob, setShowOptionalJob] = useState(false)
  const hasJob = Boolean(bridge.seededJob || draft.jobDescription.trim())
  // The draft and the carried job load after mount (hydration): open the job field once one arrives.
  useEffect(() => {
    if (hasJob) setShowOptionalJob(true)
  }, [hasJob])

  const clearPendingResumeReview = () => {
    writeWorkflowContext({
      resumePendingReview: false,
      updatedAt: Date.now(),
    })
  }

  return (
    <ToolPageShell toolId="resume">
      {mutation.isPending ? (
        <ToolPageLoading toolId="resume" mutationDone={!mutation.isPending} onCancel={mutation.cancel} />
      ) : (
        <ToolForm
          toolId="resume"
          label={`${tool.label} input form`}
          onSubmit={handleSubmit}
          submitLabel={tool.entryPointLabel}
          error={mutation.error}
          pending={mutation.isPending}
        >
          <ResumeSource
            id="resume-resumeText"
            toolId="resume"
            label={resumeField.label}
            placeholder={resumeField.placeholder}
            rows={resumeField.rows}
            value={String(draft.resumeText ?? '')}
            onChange={(text) => setField('resumeText', text)}
            seeded={bridge.seededResume}
            error={errors.resumeText}
            onEdit={clearPendingResumeReview}
          />

          {/* Optional: behind a rule, so the resume reads as the one thing this form needs. */}
          {jobField ? (
            <div className="tool-optional">
              {showOptionalJob ? (
                <>
                  {tool.supportsJobImport ? (
                    <JobImportCard
                      current={String(draft.jobDescription ?? '')}
                      onImported={(description) => setField('jobDescription', description)}
                    />
                  ) : null}
                  <Field
                    label={jobField.label}
                    optional
                    id="resume-jobDescription"
                    help={
                      // The same carried-in line as Job Match, Cover Letter and Interview (it names the application).
                      getSeededFieldNote('jobDescription', bridge, String(draft.jobDescription ?? '')) ||
                      'Add one job posting for more specific keyword and fit feedback.'
                    }
                    error={errors.jobDescription}
                  >
                    <Textarea
                      rows={jobField.rows}
                      value={String(draft.jobDescription ?? '')}
                      placeholder={jobField.placeholder}
                      onChange={(event) => setField('jobDescription', event.target.value as never)}
                    />
                  </Field>
                  {/* The way back to a resume-only review: clears the job and folds the section away again. */}
                  <div>
                    <Button
                      type="button"
                      variant="link"
                      className="tool-link"
                      onClick={() => {
                        setField('jobDescription', '' as never)
                        setShowOptionalJob(false)
                      }}
                    >
                      Remove job description
                    </Button>
                  </div>
                </>
              ) : (
                <div className="tool-optional__ask">
                  <Button type="button" variant="link" className="tool-link" onClick={() => setShowOptionalJob(true)}>
                    Add target job description
                  </Button>
                  <p className="tool-optional__hint">Optional: sharper keyword and fit feedback for one role.</p>
                </div>
              )}
            </div>
          ) : null}
        </ToolForm>
      )}
    </ToolPageShell>
  )
}

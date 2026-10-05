import { useState } from 'react'
import { Button, Field, Textarea } from '#/components/kit'
import { JobImportCard } from '#/components/tooling/JobImportCard'
import { ResumeSource } from '#/components/tooling/ResumeSource'
import {
  ToolForm,
  ToolPageLoading,
  ToolPageShell,
  useToolPageState,
} from '#/components/tooling/toolPageShared'
import { writeWorkflowContext } from '#/lib/tools/drafts'

export function ResumeToolPage() {
  const { tool, config, draft, setField, mutation, bridge, errors, handleSubmit } =
    useToolPageState('resume')

  const resumeField = config.fields.find((field) => field.name === 'resumeText')!
  const jobField = config.fields.find((field) => field.name === 'jobDescription')
  const [showOptionalJob, setShowOptionalJob] = useState(
    Boolean(bridge.seededJob || draft.jobDescription.trim()),
  )

  const clearPendingResumeReview = () => {
    writeWorkflowContext({
      resumePendingReview: false,
      updatedAt: Date.now(),
    })
  }

  return (
    <ToolPageShell toolId="resume">
      {mutation.isPending ? (
        <ToolPageLoading toolId="resume" mutationDone={!mutation.isPending} />
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
            label={resumeField.label}
            placeholder={resumeField.placeholder}
            rows={resumeField.rows}
            value={String(draft.resumeText ?? '')}
            onChange={(text) => setField('resumeText', text)}
            seeded={bridge.seededResume}
            error={errors.resumeText}
            onEdit={clearPendingResumeReview}
          />

          {jobField ? (
            showOptionalJob ? (
              <>
                {tool.supportsJobImport ? (
                  <JobImportCard
                    onImported={(description) => setField('jobDescription', description)}
                  />
                ) : null}
                <Field
                  label={jobField.label}
                  optional
                  id="resume-jobDescription"
                  help={
                    bridge.seededJob
                      ? 'A recent job description was loaded. Replace or edit it if needed.'
                      : 'Add one role for more specific keyword and fit feedback.'
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
              </>
            ) : (
              <div>
                <Button type="button" variant="link" className="tool-link" onClick={() => setShowOptionalJob(true)}>
                  Add target job description
                </Button>
              </div>
            )
          ) : null}
        </ToolForm>
      )}
    </ToolPageShell>
  )
}

import { useState } from 'react'
import { Button } from '#/components/ui/button'
import { Textarea } from '#/components/ui/textarea'
import { JobImportCard } from '#/components/tooling/JobImportCard'
import { ResumeSource } from '#/components/tooling/ResumeSource'
import {
  ToolField,
  ToolInputHero,
  ToolPageLoading,
  ToolPageShell,
  ToolSubmitRow,
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
    <ToolPageShell
      toolId="resume"
      hero={
        <ToolInputHero
          toolId="resume"
          subtitle="Upload a PDF or DOCX, or paste your resume text, then run the analyzer."
        />
      }
    >
      {mutation.isPending ? (
        <ToolPageLoading toolId="resume" mutationDone={!mutation.isPending} />
      ) : (
        <form
          aria-label={`${tool.label} input form`}
          className="tool-form"
          onSubmit={(event) => {
            event.preventDefault()
            handleSubmit()
          }}
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
                <ToolField
                  htmlFor="resume-jobDescription"
                  label={jobField.label}
                  meta="Optional"
                  note={
                    bridge.seededJob
                      ? 'A recent job description was loaded. Replace or edit it if needed.'
                      : 'Add one role for more specific keyword and fit feedback.'
                  }
                  error={errors.jobDescription}
                >
                  <Textarea
                    id="resume-jobDescription"
                    rows={jobField.rows}
                    aria-invalid={!!errors.jobDescription}
                    value={String(draft.jobDescription ?? '')}
                    placeholder={jobField.placeholder}
                    onChange={(event) => setField('jobDescription', event.target.value as never)}
                  />
                </ToolField>
              </>
            ) : (
              <div>
                <Button type="button" variant="link" size="sm" className="h-auto px-0" onClick={() => setShowOptionalJob(true)}>
                  Add target job description
                </Button>
              </div>
            )
          ) : null}

          <ToolSubmitRow
            label={tool.entryPointLabel}
            error={mutation.error}
            pending={mutation.isPending}
          />
        </form>
      )}
    </ToolPageShell>
  )
}

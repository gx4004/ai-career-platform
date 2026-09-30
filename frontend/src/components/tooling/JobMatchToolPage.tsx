import { Textarea } from '#/components/ui/textarea'
import { JobImportCard } from '#/components/tooling/JobImportCard'
import { ResumeSource } from '#/components/tooling/ResumeSource'
import {
  ToolField,
  ToolInputHero,
  ToolPageLoading,
  ToolPageShell,
  ToolSubmitRow,
  getSeededFieldNote,
  useToolPageState,
} from '#/components/tooling/toolPageShared'

export function JobMatchToolPage() {
  const { tool, config, draft, setField, mutation, bridge, errors, handleSubmit } =
    useToolPageState('job-match')

  const resumeField = config.fields.find((field) => field.name === 'resumeText')!
  const jobField = config.fields.find((field) => field.name === 'jobDescription')!

  return (
    <ToolPageShell
      toolId="job-match"
      hero={
        <ToolInputHero
          toolId="job-match"
          subtitle="Compare your resume against one specific job description."
        />
      }
    >
      {mutation.isPending ? (
        <ToolPageLoading toolId="job-match" mutationDone={!mutation.isPending} />
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
            id="job-match-resumeText"
            label={resumeField.label}
            placeholder={resumeField.placeholder}
            rows={resumeField.rows}
            value={String(draft.resumeText ?? '')}
            onChange={(text) => setField('resumeText', text)}
            seeded={bridge.seededResume}
            note={getSeededFieldNote('resumeText', bridge)}
            error={errors.resumeText}
          />

          <JobImportCard onImported={(description) => setField('jobDescription', description)} />
          <ToolField
            htmlFor="job-match-jobDescription"
            label={jobField.label}
            meta="Required"
            note={getSeededFieldNote('jobDescription', bridge)}
            error={errors.jobDescription}
          >
            <Textarea
              id="job-match-jobDescription"
              rows={jobField.rows}
              aria-invalid={!!errors.jobDescription}
              value={String(draft.jobDescription ?? '')}
              placeholder={jobField.placeholder}
              onChange={(event) => setField('jobDescription', event.target.value as never)}
            />
          </ToolField>

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

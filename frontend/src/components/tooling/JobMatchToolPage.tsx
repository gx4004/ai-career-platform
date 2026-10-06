import { Field, Textarea } from '#/components/kit'
import { JobImportCard } from '#/components/tooling/JobImportCard'
import { ResumeSource } from '#/components/tooling/ResumeSource'
import {
  ToolForm,
  ToolPageLoading,
  ToolPageShell,
  getSeededFieldNote,
  useToolPageState,
} from '#/components/tooling/toolPageShared'

export function JobMatchToolPage() {
  const { tool, config, draft, setField, mutation, bridge, errors, handleSubmit } =
    useToolPageState('job-match')

  const resumeField = config.fields.find((field) => field.name === 'resumeText')!
  const jobField = config.fields.find((field) => field.name === 'jobDescription')!

  return (
    <ToolPageShell toolId="job-match">
      {mutation.isPending ? (
        <ToolPageLoading toolId="job-match" mutationDone={!mutation.isPending} onCancel={mutation.cancel} />
      ) : (
        <ToolForm
          toolId="job-match"
          label={`${tool.label} input form`}
          onSubmit={handleSubmit}
          submitLabel={tool.entryPointLabel}
          error={mutation.error}
          pending={mutation.isPending}
        >
          <ResumeSource
            id="job-match-resumeText"
            label={resumeField.label}
            placeholder={resumeField.placeholder}
            rows={resumeField.rows}
            value={String(draft.resumeText ?? '')}
            onChange={(text) => setField('resumeText', text)}
            seeded={bridge.seededResume}
            error={errors.resumeText}
          />

          <JobImportCard
            current={String(draft.jobDescription ?? '')}
            onImported={(description) => setField('jobDescription', description)}
          />
          <Field
            label={jobField.label}
            id="job-match-jobDescription"
            help={getSeededFieldNote('jobDescription', bridge, String(draft.jobDescription ?? '')) || undefined}
            error={errors.jobDescription}
          >
            <Textarea
              rows={jobField.rows}
              value={String(draft.jobDescription ?? '')}
              placeholder={jobField.placeholder}
              onChange={(event) => setField('jobDescription', event.target.value as never)}
            />
          </Field>
        </ToolForm>
      )}
    </ToolPageShell>
  )
}

import { Field, Segmented, Textarea } from '#/components/kit'
import { JobImportCard } from '#/components/tooling/JobImportCard'
import { ResumeSource } from '#/components/tooling/ResumeSource'
import {
  ToolForm,
  ToolPageLoading,
  ToolPageShell,
  getSeededFieldNote,
  useToolPageState,
} from '#/components/tooling/toolPageShared'

const questionCounts = [4, 6, 8, 10]

export function InterviewToolPage() {
  const { tool, config, draft, setField, mutation, bridge, errors, handleSubmit } =
    useToolPageState('interview')

  const resumeField = config.fields.find((field) => field.name === 'resumeText')!
  const jobField = config.fields.find((field) => field.name === 'jobDescription')!

  return (
    <ToolPageShell toolId="interview">
      {mutation.isPending ? (
        <ToolPageLoading toolId="interview" mutationDone={!mutation.isPending} />
      ) : (
        <ToolForm
          toolId="interview"
          label={`${tool.label} input form`}
          onSubmit={handleSubmit}
          submitLabel={tool.entryPointLabel}
          error={mutation.error}
          pending={mutation.isPending}
        >
          <ResumeSource
            id="interview-resumeText"
            label={resumeField.label}
            placeholder={resumeField.placeholder}
            rows={resumeField.rows}
            value={String(draft.resumeText ?? '')}
            onChange={(text) => setField('resumeText', text)}
            seeded={bridge.seededResume}
            error={errors.resumeText}
          />

          <JobImportCard onImported={(description) => setField('jobDescription', description)} />
          <Field
            label={jobField.label}
            id="interview-jobDescription"
            help={getSeededFieldNote('jobDescription', bridge) || undefined}
            error={errors.jobDescription}
          >
            <Textarea
              rows={jobField.rows}
              value={String(draft.jobDescription ?? '')}
              placeholder={jobField.placeholder}
              onChange={(event) => setField('jobDescription', event.target.value as never)}
            />
          </Field>

          <Field label="Practice depth" help="Number of questions" error={errors.numQuestions}>
            <Segmented
              value={Number(draft.numQuestions)}
              options={questionCounts.map((count) => ({
                value: count,
                label: String(count),
                'aria-label': `${count} questions`,
              }))}
              onValueChange={(count) => setField('numQuestions', count as never)}
            />
          </Field>
        </ToolForm>
      )}
    </ToolPageShell>
  )
}

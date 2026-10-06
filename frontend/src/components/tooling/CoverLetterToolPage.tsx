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

export function CoverLetterToolPage() {
  const { tool, config, draft, setField, mutation, bridge, errors, handleSubmit } =
    useToolPageState('cover-letter')

  const resumeField = config.fields.find((field) => field.name === 'resumeText')!
  const jobField = config.fields.find((field) => field.name === 'jobDescription')!
  const toneField = config.fields.find((field) => field.name === 'tone')!

  return (
    <ToolPageShell toolId="cover-letter">
      {mutation.isPending ? (
        <ToolPageLoading toolId="cover-letter" mutationDone={!mutation.isPending} onCancel={mutation.cancel} />
      ) : (
        <ToolForm
          toolId="cover-letter"
          label={`${tool.label} input form`}
          onSubmit={handleSubmit}
          submitLabel={tool.entryPointLabel}
          error={mutation.error}
          pending={mutation.isPending}
        >
          <ResumeSource
            id="cover-letter-resumeText"
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
            id="cover-letter-jobDescription"
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

          <Field label={toneField.label} optional>
            <Segmented
              value={String(draft.tone ?? '')}
              options={(toneField.choices ?? []).map((choice) => ({
                value: String(choice.value),
                label: choice.label,
              }))}
              onValueChange={(value) => setField('tone', value as never)}
            />
          </Field>
        </ToolForm>
      )}
    </ToolPageShell>
  )
}

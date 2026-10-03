import { Textarea } from '#/components/ui/textarea'
import { JobImportCard } from '#/components/tooling/JobImportCard'
import { ResumeSource } from '#/components/tooling/ResumeSource'
import {
  ToolField,
  ToolInputHero,
  ToolPageLoading,
  ToolPageShell,
  ToolSegmented,
  ToolSubmitRow,
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
    <ToolPageShell
      toolId="cover-letter"
      hero={
        <ToolInputHero
          toolId="cover-letter"
          subtitle="Review your resume, paste the posting, choose a tone, and generate a first draft."
        />
      }
    >
      {mutation.isPending ? (
        <ToolPageLoading toolId="cover-letter" mutationDone={!mutation.isPending} />
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
            id="cover-letter-resumeText"
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
            htmlFor="cover-letter-jobDescription"
            label={jobField.label}
            note={getSeededFieldNote('jobDescription', bridge)}
            error={errors.jobDescription}
          >
            <Textarea
              id="cover-letter-jobDescription"
              rows={jobField.rows}
              aria-invalid={!!errors.jobDescription}
              value={String(draft.jobDescription ?? '')}
              placeholder={jobField.placeholder}
              onChange={(event) => setField('jobDescription', event.target.value as never)}
            />
          </ToolField>

          <ToolField label={toneField.label} meta="Optional">
            <ToolSegmented
              ariaLabel="Tone controls"
              value={String(draft.tone ?? '')}
              options={(toneField.choices ?? []).map((choice) => ({
                value: String(choice.value),
                label: choice.label,
              }))}
              onChange={(value) => setField('tone', value as never)}
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

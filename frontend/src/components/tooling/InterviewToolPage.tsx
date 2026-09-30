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

const questionCounts = [4, 6, 8, 10]

export function InterviewToolPage() {
  const { tool, config, draft, setField, mutation, bridge, errors, handleSubmit } =
    useToolPageState('interview')

  const resumeField = config.fields.find((field) => field.name === 'resumeText')!
  const jobField = config.fields.find((field) => field.name === 'jobDescription')!

  return (
    <ToolPageShell
      toolId="interview"
      hero={
        <ToolInputHero
          toolId="interview"
          subtitle="Check the resume and job description, then choose how many questions to practice."
        />
      }
    >
      {mutation.isPending ? (
        <ToolPageLoading toolId="interview" mutationDone={!mutation.isPending} />
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
            id="interview-resumeText"
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
            htmlFor="interview-jobDescription"
            label={jobField.label}
            meta="Required"
            note={getSeededFieldNote('jobDescription', bridge)}
            error={errors.jobDescription}
          >
            <Textarea
              id="interview-jobDescription"
              rows={jobField.rows}
              aria-invalid={!!errors.jobDescription}
              value={String(draft.jobDescription ?? '')}
              placeholder={jobField.placeholder}
              onChange={(event) => setField('jobDescription', event.target.value as never)}
            />
          </ToolField>

          <ToolField
            label="Practice depth"
            note="Number of questions to generate."
            error={errors.numQuestions}
          >
            <ToolSegmented
              ariaLabel="Question count quick picks"
              value={Number(draft.numQuestions)}
              options={questionCounts.map((count) => ({
                value: count,
                label: String(count),
                ariaLabel: `${count} questions`,
              }))}
              onChange={(count) => setField('numQuestions', count as never)}
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

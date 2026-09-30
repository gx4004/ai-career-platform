import { Input } from '#/components/ui/input'
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

export function CareerToolPage() {
  const { tool, config, draft, setField, mutation, bridge, errors, handleSubmit } =
    useToolPageState('career')

  const resumeField = config.fields.find((field) => field.name === 'resumeText')!
  const targetRoleField = config.fields.find((field) => field.name === 'targetRole')!

  return (
    <ToolPageShell
      toolId="career"
      hero={
        <ToolInputHero
          toolId="career"
          subtitle="Review the resume text, optionally add a target role, then compare realistic next directions."
        />
      }
    >
      {mutation.isPending ? (
        <ToolPageLoading toolId="career" mutationDone={!mutation.isPending} />
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
            id="career-resumeText"
            label={resumeField.label}
            placeholder={resumeField.placeholder}
            rows={resumeField.rows}
            value={String(draft.resumeText ?? '')}
            onChange={(text) => setField('resumeText', text)}
            seeded={bridge.seededResume}
            note={getSeededFieldNote('resumeText', bridge)}
            error={errors.resumeText}
          />

          <ToolField
            htmlFor="career-targetRole"
            label={targetRoleField.label}
            meta="Optional"
            note={
              getSeededFieldNote('targetRole', bridge) ||
              'Leave blank to get the strongest adjacent paths from your resume.'
            }
          >
            <Input
              id="career-targetRole"
              value={String(draft.targetRole ?? '')}
              placeholder={targetRoleField.placeholder}
              onChange={(event) => setField('targetRole', event.target.value as never)}
            />
          </ToolField>

          <ToolSubmitRow
            label="Compare career paths"
            error={mutation.error}
            pending={mutation.isPending}
          />
        </form>
      )}
    </ToolPageShell>
  )
}

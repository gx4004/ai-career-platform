import { Field, Input } from '#/components/kit'
import { ResumeSource } from '#/components/tooling/ResumeSource'
import {
  ToolForm,
  ToolPageLoading,
  ToolPageShell,
  getSeededFieldNote,
  useToolPageState,
} from '#/components/tooling/toolPageShared'

export function CareerToolPage() {
  const { tool, config, draft, setField, mutation, bridge, errors, handleSubmit } =
    useToolPageState('career')

  const resumeField = config.fields.find((field) => field.name === 'resumeText')!
  const targetRoleField = config.fields.find((field) => field.name === 'targetRole')!

  return (
    <ToolPageShell toolId="career">
      {mutation.isPending ? (
        <ToolPageLoading toolId="career" mutationDone={!mutation.isPending} onCancel={mutation.cancel} />
      ) : (
        <ToolForm
          toolId="career"
          label={`${tool.label} input form`}
          onSubmit={handleSubmit}
          submitLabel={tool.entryPointLabel}
          error={mutation.error}
          pending={mutation.isPending}
        >
          <ResumeSource
            id="career-resumeText"
            label={resumeField.label}
            placeholder={resumeField.placeholder}
            rows={resumeField.rows}
            value={String(draft.resumeText ?? '')}
            onChange={(text) => setField('resumeText', text)}
            seeded={bridge.seededResume}
            error={errors.resumeText}
          />

          <Field
            label={targetRoleField.label}
            optional
            id="career-targetRole"
            help={
              getSeededFieldNote('targetRole', bridge, String(draft.targetRole ?? '')) ||
              'Leave blank to get the strongest adjacent paths from your resume.'
            }
          >
            <Input
              value={String(draft.targetRole ?? '')}
              placeholder={targetRoleField.placeholder}
              onChange={(event) => setField('targetRole', event.target.value as never)}
            />
          </Field>
        </ToolForm>
      )}
    </ToolPageShell>
  )
}

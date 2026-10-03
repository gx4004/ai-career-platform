import { Field, Input } from '#/components/kit'
import { ResumeSource } from '#/components/tooling/ResumeSource'
import {
  ToolForm,
  ToolPageLoading,
  ToolPageShell,
  getSeededFieldNote,
  useToolPageState,
} from '#/components/tooling/toolPageShared'

export function PortfolioToolPage() {
  const { tool, config, draft, setField, mutation, bridge, errors, handleSubmit } =
    useToolPageState('portfolio')

  const resumeField = config.fields.find((field) => field.name === 'resumeText')!
  const targetRoleField = config.fields.find((field) => field.name === 'targetRole')!

  return (
    <ToolPageShell toolId="portfolio">
      {mutation.isPending ? (
        <ToolPageLoading toolId="portfolio" mutationDone={!mutation.isPending} />
      ) : (
        <ToolForm
          label={`${tool.label} input form`}
          onSubmit={handleSubmit}
          submitLabel="Generate roadmap"
          error={mutation.error}
          pending={mutation.isPending}
        >
          <ResumeSource
            id="portfolio-resumeText"
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
            id="portfolio-targetRole"
            help={getSeededFieldNote('targetRole', bridge) || undefined}
            error={errors.targetRole}
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

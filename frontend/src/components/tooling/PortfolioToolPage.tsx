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

export function PortfolioToolPage() {
  const { tool, config, draft, setField, mutation, bridge, errors, handleSubmit } =
    useToolPageState('portfolio')

  const resumeField = config.fields.find((field) => field.name === 'resumeText')!
  const targetRoleField = config.fields.find((field) => field.name === 'targetRole')!

  return (
    <ToolPageShell
      toolId="portfolio"
      hero={
        <ToolInputHero
          toolId="portfolio"
          subtitle="Add the role you want next and generate a focused project roadmap."
        />
      }
    >
      {mutation.isPending ? (
        <ToolPageLoading toolId="portfolio" mutationDone={!mutation.isPending} />
      ) : (
        <form
          aria-label={`${tool.label} input form`}
          className="tool-form"
          onSubmit={(event) => {
            event.preventDefault()
            handleSubmit()
          }}
        >
          <ToolField
            htmlFor="portfolio-targetRole"
            label={targetRoleField.label}
            meta="Required"
            note={getSeededFieldNote('targetRole', bridge)}
            error={errors.targetRole}
          >
            <Input
              id="portfolio-targetRole"
              aria-invalid={!!errors.targetRole}
              value={String(draft.targetRole ?? '')}
              placeholder={targetRoleField.placeholder}
              onChange={(event) => setField('targetRole', event.target.value as never)}
            />
          </ToolField>

          <ResumeSource
            id="portfolio-resumeText"
            label={resumeField.label}
            placeholder={resumeField.placeholder}
            rows={resumeField.rows}
            value={String(draft.resumeText ?? '')}
            onChange={(text) => setField('resumeText', text)}
            seeded={bridge.seededResume}
            note={getSeededFieldNote('resumeText', bridge)}
            error={errors.resumeText}
          />

          <ToolSubmitRow
            label="Generate roadmap"
            error={mutation.error}
            pending={mutation.isPending}
          />
        </form>
      )}
    </ToolPageShell>
  )
}

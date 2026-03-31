import { useState } from 'react'
import { ArrowRight } from 'lucide-react'
import { Button } from '#/components/ui/button'
import { Input } from '#/components/ui/input'
import { Label } from '#/components/ui/label'
import { Textarea } from '#/components/ui/textarea'
import { DropzoneHero } from '#/components/tooling/DropzoneHero'
import { ToolHeroIllustration } from '#/components/tooling/ToolHeroIllustration'
import {
  ParsedResumeNotice,
  ToolPageLoading,
  ToolPageShell,
  getSeededFieldNote,
  useToolPageState,
} from '#/components/tooling/toolPageShared'
import { toolAccentStyle } from '#/lib/tools/styleUtils'

export function CareerToolPage() {
  const {
    tool,
    config,
    status,
    openAuthDialog,
    draft,
    setField,
    mutation,
    bridge,
    errors,
    handleSubmit,
  } = useToolPageState('career')

  const resumeField = config.fields.find((field) => field.name === 'resumeText')!
  const targetRoleField = config.fields.find((field) => field.name === 'targetRole')!
  const [phase, setPhase] = useState<'upload' | 'form'>(
    draft.resumeText.trim() || bridge.seededResume ? 'form' : 'upload',
  )
  const [resumeEditorCollapsed, setResumeEditorCollapsed] = useState(false)
  const hasResumeContent = Boolean(draft.resumeText.trim() || bridge.seededResume)

  return (
    <ToolPageShell toolId="career" bodyClassName="career-bespoke-page">
      {mutation.isPending ? (
        <ToolPageLoading toolId="career" className="career-loading-shell" />
      ) : phase === 'upload' ? (
        <>
          <section className="resume-bespoke-header">
            <div className="resume-bespoke-visual">
              <ToolHeroIllustration toolId="career" accent={tool.accent} loading={false} />
            </div>
            <h1 className="resume-bespoke-title">{tool.label}</h1>
            <p className="resume-bespoke-subtitle">
              Start with your current resume, then optionally add a target direction before you
              compare paths.
            </p>
          </section>

          <section className="career-step-shell" style={toolAccentStyle(tool.accent)}>
            <div className="wizard-step-indicator" aria-label="Career steps">
              <span className="wizard-step wizard-step--active">1</span>
              <span className="wizard-step-line" />
              <span className="wizard-step">2</span>
            </div>
            <div className="wizard-step-caption-row wizard-step-caption-row--two-up">
              <span>Current profile</span>
              <span>Compare paths</span>
            </div>
          </section>

          <section className="resume-upload-stage">
            <DropzoneHero
              accent={tool.accent}
              onParsed={(text) => {
                setField('resumeText', text)
                setResumeEditorCollapsed(true)
                setPhase('form')
              }}
              onPasteText={() => {
                setResumeEditorCollapsed(false)
                setPhase('form')
              }}
            />
          </section>
        </>
      ) : (
        <>
          <section className="resume-bespoke-header">
            <div className="resume-bespoke-visual">
              <ToolHeroIllustration toolId="career" accent={tool.accent} loading={false} />
            </div>
            <h1 className="resume-bespoke-title">{tool.label}</h1>
            <p className="resume-bespoke-subtitle">
              Review the resume text, optionally add a target role, then compare realistic next
              directions.
            </p>
          </section>

          <form
            aria-label={`${tool.label} input form`}
            className="career-bespoke-form"
            onSubmit={(event) => {
              event.preventDefault()
              handleSubmit()
            }}
          >
            <section className="career-step-shell" style={toolAccentStyle(tool.accent)}>
              <div className="wizard-step-indicator" aria-label="Career steps">
                <span className="wizard-step wizard-step--done">1</span>
                <span className="wizard-step-line wizard-step-line--done" />
                <span className="wizard-step wizard-step--active">2</span>
              </div>
              <div className="wizard-step-caption-row wizard-step-caption-row--two-up">
                <span>Current profile</span>
                <span>Compare paths</span>
              </div>
            </section>

            <section className="career-primary-shell">
              <DropzoneHero
                accent={tool.accent}
                compact
                collapseOnSuccess
                preLoaded={hasResumeContent}
                preLoadedLabel={bridge.seededResume ? 'Resume carried from previous tool' : undefined}
                onParsed={(text) => {
                  setField('resumeText', text)
                  setResumeEditorCollapsed(true)
                }}
                onPasteText={() => {
                  setResumeEditorCollapsed(false)
                  document.getElementById('career-resumeText')?.focus()
                }}
              />
              {resumeEditorCollapsed && draft.resumeText.trim() ? (
                <ParsedResumeNotice
                  body="Resume parsed successfully. Open the extracted text only if you want to review it before comparing paths."
                  onAction={() => setResumeEditorCollapsed(false)}
                />
              ) : (
                <div className="grid gap-2">
                  <Label className="tool-field-label" htmlFor="career-resumeText">
                    <span>{resumeField.label}</span>
                    <span className="small-copy muted-copy">Required</span>
                  </Label>
                  {getSeededFieldNote('resumeText', bridge) ? (
                    <p className="tool-fs-field-note">{getSeededFieldNote('resumeText', bridge)}</p>
                  ) : null}
                  <Textarea
                    id="career-resumeText"
                    rows={resumeField.rows}
                    className="resume-paste-textarea"
                    value={String(draft.resumeText ?? '')}
                    placeholder={resumeField.placeholder}
                    onChange={(event) => setField('resumeText', event.target.value as never)}
                  />
                  {errors.resumeText ? (
                    <p className="small-copy" style={{ color: 'var(--destructive)' }}>
                      {errors.resumeText}
                    </p>
                  ) : null}
                </div>
              )}
            </section>

            <section className="career-target-shell">
              <div className="grid gap-2">
                <Label className="tool-field-label" htmlFor="career-targetRole">
                  <span>{targetRoleField.label}</span>
                  <span className="small-copy muted-copy">Optional</span>
                </Label>
                {getSeededFieldNote('targetRole', bridge) ? (
                  <p className="tool-fs-field-note">
                    {getSeededFieldNote('targetRole', bridge)}
                  </p>
                ) : null}
                <Input
                  id="career-targetRole"
                  value={String(draft.targetRole ?? '')}
                  placeholder={targetRoleField.placeholder}
                  onChange={(event) => setField('targetRole', event.target.value as never)}
                />
                <p className="small-copy muted-copy">
                  Leave this blank if you want the strongest adjacent paths from your current resume.
                </p>
              </div>
            </section>

            <div className="tool-fs-footer">
              {status !== 'authenticated' ? (
                <div className="tool-inline-save-prompt">
                  <p className="small-copy muted-copy">
                    Sign in if you want to keep this path comparison in your workspace.
                  </p>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() =>
                      openAuthDialog({
                        to: tool.route,
                        reason: `${tool.id}-workspace`,
                        label: 'Sign in to save runs',
                      })
                    }
                  >
                    Sign in to save runs
                  </Button>
                </div>
              ) : null}
              {mutation.error ? (
                <p className="tool-inline-error small-copy" style={{ color: 'var(--destructive)' }}>
                  {mutation.error instanceof Error ? mutation.error.message : 'This run failed.'}
                </p>
              ) : null}
              <div className="tool-fs-submit-row">
                <Button
                  type="submit"
                  size="lg"
                  className="tool-fs-submit-button"
                  style={{ background: tool.accent, color: '#ffffff' }}
                  disabled={mutation.isPending}
                >
                  Compare career paths
                  <ArrowRight size={16} />
                </Button>
              </div>
            </div>
          </form>
        </>
      )}
    </ToolPageShell>
  )
}

import { useState } from 'react'
import { ArrowRight } from 'lucide-react'
import { Button } from '#/components/ui/button'
import { Label } from '#/components/ui/label'
import { Textarea } from '#/components/ui/textarea'
import { DropzoneHero } from '#/components/tooling/DropzoneHero'
import { JobImportCard } from '#/components/tooling/JobImportCard'
import { ToolHeroIllustration } from '#/components/tooling/ToolHeroIllustration'
import {
  ParsedResumeNotice,
  ToolPageLoading,
  ToolPageShell,
  useToolPageState,
} from '#/components/tooling/toolPageShared'
import { writeWorkflowContext } from '#/lib/tools/drafts'

export function ResumeToolPage() {
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
  } = useToolPageState('resume')

  const resumeField = config.fields.find((field) => field.name === 'resumeText')!
  const jobField = config.fields.find((field) => field.name === 'jobDescription')
  const resumeFieldId = 'resume-resumeText'
  const [phase, setPhase] = useState<'upload' | 'form'>(
    draft.resumeText.trim() || bridge.seededResume ? 'form' : 'upload',
  )
  const [resumeEditorCollapsed, setResumeEditorCollapsed] = useState(bridge.resumePendingReview)
  const [showOptionalJob, setShowOptionalJob] = useState(
    Boolean(bridge.seededJob || draft.jobDescription.trim()),
  )
  const hasResumeContent = Boolean(draft.resumeText.trim() || bridge.seededResume)

  const clearPendingResumeReview = () => {
    writeWorkflowContext({
      resumePendingReview: false,
      updatedAt: Date.now(),
    })
  }

  const openResumeEditor = () => {
    clearPendingResumeReview()
    setResumeEditorCollapsed(false)
  }

  const collapseResumeEditorAfterParse = (text: string) => {
    clearPendingResumeReview()
    setField('resumeText', text)
    setResumeEditorCollapsed(true)
  }

  return (
    <ToolPageShell toolId="resume" bodyClassName="resume-bespoke-page">
      {mutation.isPending ? (
        <ToolPageLoading toolId="resume" className="resume-loading-shell" />
      ) : phase === 'upload' ? (
        <>
          <section className="resume-bespoke-header">
            <div className="resume-bespoke-visual">
              <ToolHeroIllustration toolId="resume" accent={tool.accent} loading={false} />
            </div>
            <h1 className="resume-bespoke-title">{tool.label}</h1>
            <p className="resume-bespoke-subtitle">
              Upload a PDF or DOCX, then review the extracted text before you run the analyzer.
            </p>
          </section>

          <section className="resume-upload-stage">
            <DropzoneHero
              accent={tool.accent}
              onParsed={(text) => {
                collapseResumeEditorAfterParse(text)
                setPhase('form')
              }}
              onPasteText={() => {
                openResumeEditor()
                setPhase('form')
              }}
            />
          </section>
        </>
      ) : (
        <>
          <section className="resume-bespoke-header">
            <div className="resume-bespoke-visual">
              <ToolHeroIllustration toolId="resume" accent={tool.accent} loading={false} />
            </div>
            <h1 className="resume-bespoke-title">{tool.label}</h1>
            <p className="resume-bespoke-subtitle">
              Edit the extracted text, add a target role if you want, then run the analyzer.
            </p>
            {bridge.seededResume ? (
              <p className="resume-bespoke-note">
                Loaded your latest resume context. Replace it with a new file or edit the text
                below anytime.
              </p>
            ) : null}
          </section>

          <form
            aria-label={`${tool.label} input form`}
            className="resume-form-section"
            onSubmit={(event) => {
              event.preventDefault()
              handleSubmit()
            }}
          >
            <section className="resume-upload-stage">
              <DropzoneHero
                accent={tool.accent}
                compact
                collapseOnSuccess
                preLoaded={hasResumeContent}
                preLoadedLabel={bridge.seededResume ? 'Resume carried from previous tool' : undefined}
                onParsed={(text) => {
                  collapseResumeEditorAfterParse(text)
                }}
                onPasteText={() => {
                  openResumeEditor()
                  document.getElementById(resumeFieldId)?.focus()
                }}
              />
            </section>

            {resumeEditorCollapsed && hasResumeContent ? (
              <ParsedResumeNotice
                body="Resume parsed successfully. Open the extracted text only if you want to review or edit it."
                onAction={openResumeEditor}
              />
            ) : (
              <section className="resume-editor-shell">
                <div className="resume-editor-header">
                  <Label className="tool-field-label" htmlFor={resumeFieldId}>
                    <span>{resumeField.label}</span>
                    <span className="small-copy muted-copy">Required</span>
                  </Label>
                  <p className="resume-inline-note">
                    Paste resume text manually or review the extracted text before you analyze it.
                  </p>
                </div>
                <Textarea
                  id={resumeFieldId}
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
              </section>
            )}

            {jobField ? (
              <section className="resume-optional-shell">
                <div className="resume-optional-header">
                  <p className="section-title">Target job description</p>
                  <p className="small-copy muted-copy">
                    Optional. Add one role if you want more specific keyword and fit feedback.
                  </p>
                  {bridge.seededJob ? (
                    <p className="resume-inline-note">
                      A recent job description was loaded into this step. Replace or edit it if
                      needed.
                    </p>
                  ) : null}
                </div>
                {!showOptionalJob ? (
                  <div className="resume-optional-toggle">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => setShowOptionalJob(true)}
                    >
                      Add target job description
                    </Button>
                  </div>
                ) : (
                  <>
                    {tool.supportsJobImport ? (
                      <JobImportCard
                        onImported={(description) => setField('jobDescription', description)}
                      />
                    ) : null}
                    <div className="grid gap-2">
                      <Label className="tool-field-label" htmlFor="resume-jobDescription">
                        <span>{jobField.label}</span>
                        <span className="small-copy muted-copy">Optional</span>
                      </Label>
                      <Textarea
                        id="resume-jobDescription"
                        rows={jobField.rows}
                        value={String(draft.jobDescription ?? '')}
                        placeholder={jobField.placeholder}
                        onChange={(event) => setField('jobDescription', event.target.value as never)}
                      />
                      {errors.jobDescription ? (
                        <p className="small-copy" style={{ color: 'var(--destructive)' }}>
                          {errors.jobDescription}
                        </p>
                      ) : null}
                    </div>
                  </>
                )}
              </section>
            ) : null}

            {status !== 'authenticated' ? (
              <div className="resume-guest-inline">
                <p className="small-copy muted-copy">
                  Sign in if you want this run saved to history and your workspace.
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
              <p className="resume-error-inline small-copy" style={{ color: 'var(--destructive)' }}>
                {mutation.error instanceof Error ? mutation.error.message : 'This run failed.'}
              </p>
            ) : null}

            <div className="resume-submit-area" data-testid="resume-sticky-submit">
              <div className="resume-submit-bar">
                <Button
                  type="submit"
                  size="lg"
                  className="resume-submit-btn"
                  style={{ background: tool.accent, color: '#ffffff' }}
                  disabled={mutation.isPending}
                >
                  {tool.entryPointLabel}
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
